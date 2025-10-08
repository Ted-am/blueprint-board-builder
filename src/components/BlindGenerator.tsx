import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Plus, Eye, Trash2, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Language, getTranslation } from "@/lib/translations";
import { LanguageSelector } from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useParams } from "react-router-dom";

interface FrameData {
  id?: string; // Database ID for deleting
  name: string;
  width: number;
  height: number;
  slatWidth: number;
  slatDepth: number;
  supportSpacing: number;
  coveringMaterial: string;
  plywoodThickness: number;
}

// Calculate optimal cut list from standard board lengths
const calculateOptimalCutList = (pieces: { length: number; qty: number }[], standardLength = 6000) => {
  const cuts: { boardLength: number; cuts: number[]; waste: number }[] = [];
  const allPieces: number[] = [];
  
  pieces.forEach(piece => {
    for (let i = 0; i < piece.qty; i++) {
      allPieces.push(piece.length);
    }
  });
  
  // Sort pieces in descending order for better fitting
  allPieces.sort((a, b) => b - a);
  
  while (allPieces.length > 0) {
    const board: number[] = [];
    let remainingLength = standardLength;
    let i = 0;
    
    while (i < allPieces.length) {
      if (allPieces[i] <= remainingLength) {
        board.push(allPieces[i]);
        remainingLength -= allPieces[i];
        allPieces.splice(i, 1);
      } else {
        i++;
      }
    }
    
    cuts.push({
      boardLength: standardLength,
      cuts: board,
      waste: remainingLength
    });
  }
  
  return cuts;
};

// Draw frame sketch on canvas and return as data URL
const drawFrameSketch = (frame: FrameData): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const scale = Math.min(
    (canvas.width - 60) / frame.width,
    (canvas.height - 60) / frame.height
  );
  
  const scaledWidth = frame.width * scale;
  const scaledHeight = frame.height * scale;
  const offsetX = (canvas.width - scaledWidth) / 2;
  const offsetY = (canvas.height - scaledHeight) / 2;
  const scaledDepth = frame.slatDepth * scale;
  
  // Draw frame
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#dbeafe';
  
  // Outer rectangle
  ctx.fillRect(offsetX, offsetY, scaledWidth, scaledHeight);
  ctx.strokeRect(offsetX, offsetY, scaledWidth, scaledHeight);
  
  // Inner rectangle (showing depth)
  ctx.strokeRect(offsetX + scaledDepth, offsetY + scaledDepth, 
                 scaledWidth - 2 * scaledDepth, scaledHeight - 2 * scaledDepth);
  
  // Draw horizontal supports
  const additionalHorizontals = frame.height > frame.supportSpacing 
    ? Math.floor((frame.height - 2 * frame.slatDepth) / frame.supportSpacing) 
    : 0;
    
  ctx.strokeStyle = '#1e40af';
  for (let i = 1; i <= additionalHorizontals; i++) {
    const y = offsetY + scaledHeight - scaledDepth - (i * frame.supportSpacing * scale);
    ctx.beginPath();
    ctx.moveTo(offsetX + scaledDepth, y);
    ctx.lineTo(offsetX + scaledWidth - scaledDepth, y);
    ctx.stroke();
  }
  
  // Add dimensions
  ctx.fillStyle = '#000000';
  ctx.font = '12px monospace';
  ctx.fillText(`${frame.width/10}cm`, offsetX + scaledWidth/2 - 20, offsetY - 10);
  ctx.fillText(`${frame.height/10}cm`, offsetX - 40, offsetY + scaledHeight/2);
  
  return canvas.toDataURL('image/png');
};

interface BlindGeneratorProps {
  initialData?: any;
  onDataChange?: (data: any) => void;
  onSave?: () => void;
}

const BlindGenerator = ({ initialData, onDataChange, onSave }: BlindGeneratorProps = {}) => {
  const [width, setWidth] = useState(500); // mm
  const [height, setHeight] = useState(2000); // mm
  const [slatWidth, setSlatWidth] = useState(25); // mm board width
  const [slatDepth, setSlatDepth] = useState(20); // mm board depth
  const [supportSpacing, setSupportSpacing] = useState(500); // mm spacing between horizontal supports
  const [selectedSupport, setSelectedSupport] = useState<number | null>(null); // index of selected horizontal support (1-based, null = none)
  const [showCovering, setShowCovering] = useState(false); // show frame covering
  const [coveringMaterial, setCoveringMaterial] = useState<"none" | "fabric" | "plywood">("none"); // covering material type
  const [plywoodThickness, setPlywoodThickness] = useState(6); // mm plywood thickness
  const [showHorizontalSpacers, setShowHorizontalSpacers] = useState(true); // show horizontal spacers
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Language state
  const [language, setLanguage] = useState<Language>('en');
  const t = getTranslation(language);
  
  // Bin management state
  const [bins, setBins] = useState<Array<{ id: string; name: string; created_at: string }>>([]);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [bin, setBin] = useState<FrameData[]>([]);
  const [showBinDialog, setShowBinDialog] = useState(false);
  const [showNewBinDialog, setShowNewBinDialog] = useState(false);
  const [newBinName, setNewBinName] = useState("");
  const [showEditBinDialog, setShowEditBinDialog] = useState(false);
  const [editBinName, setEditBinName] = useState("");
  
  const { id: projectId } = useParams();

  // Load bins from database
  const loadBins = async () => {
    if (!projectId) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase
      .from('bins')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading bins:', error);
      toast({ title: "Error loading bins", variant: "destructive" });
      return;
    }
    
    setBins(data || []);
    
    // Auto-select first bin if none selected
    if (data && data.length > 0 && !selectedBinId) {
      setSelectedBinId(data[0].id);
    }
  };
  
  // Load frames for selected bin
  const loadBinFrames = async () => {
    if (!selectedBinId) {
      setBin([]);
      return;
    }
    
    const { data, error } = await supabase
      .from('bin_frames')
      .select('*')
      .eq('bin_id', selectedBinId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading bin frames:', error);
      toast({ title: "Error loading frames", variant: "destructive" });
      return;
    }
    
    // Convert database format to FrameData format
    const frames: FrameData[] = (data || []).map(frame => ({
      id: frame.id,
      name: frame.name,
      width: frame.width,
      height: frame.height,
      slatWidth: frame.slat_width,
      slatDepth: frame.slat_depth,
      supportSpacing: frame.support_spacing,
      coveringMaterial: frame.covering_material,
      plywoodThickness: frame.plywood_thickness,
    }));
    
    setBin(frames);
  };
  
  // Create new bin
  const createNewBin = async () => {
    if (!newBinName.trim()) {
      toast({ title: "Please enter a bin name", variant: "destructive" });
      return;
    }
    
    if (!projectId) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Please log in", variant: "destructive" });
      return;
    }
    
    const { data, error } = await supabase
      .from('bins')
      .insert({
        user_id: user.id,
        project_id: projectId,
        name: newBinName.trim(),
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating bin:', error);
      toast({ title: "Error creating bin", variant: "destructive" });
      return;
    }
    
    toast({ title: "Bin created successfully" });
    setNewBinName("");
    setShowNewBinDialog(false);
    await loadBins();
    setSelectedBinId(data.id);
  };
  
  // Edit bin name
  const editBin = async () => {
    if (!editBinName.trim()) {
      toast({ title: "Please enter a bin name", variant: "destructive" });
      return;
    }
    
    if (!selectedBinId) return;
    
    const { error } = await supabase
      .from('bins')
      .update({ name: editBinName.trim() })
      .eq('id', selectedBinId);
    
    if (error) {
      console.error('Error updating bin:', error);
      toast({ title: "Error updating bin", variant: "destructive" });
      return;
    }
    
    toast({ title: "Bin renamed successfully" });
    setEditBinName("");
    setShowEditBinDialog(false);
    await loadBins();
  };
  
  // Delete bin
  const deleteBin = async (binId: string) => {
    const binToDelete = bins.find(b => b.id === binId);
    const binName = binToDelete?.name || "this bin";
    
    if (!confirm(`Are you sure you want to delete "${binName}"? All frames in it will be deleted.`)) {
      return;
    }
    
    const { error } = await supabase
      .from('bins')
      .delete()
      .eq('id', binId);
    
    if (error) {
      console.error('Error deleting bin:', error);
      toast({ title: "Error deleting bin", variant: "destructive" });
      return;
    }
    
    toast({ title: "Bin deleted successfully" });
    
    if (selectedBinId === binId) {
      setSelectedBinId(null);
    }
    
    await loadBins();
  };

  // Load initial data
  useEffect(() => {
    loadBins();
    
    // Load settings from initialData if provided
    if (initialData) {
      setWidth(initialData.width || 500);
      setHeight(initialData.height || 2000);
      setSlatWidth(initialData.slatWidth || 25);
      setSlatDepth(initialData.slatDepth || 20);
      setSupportSpacing(initialData.supportSpacing || 500);
      setSelectedSupport(initialData.selectedSupport ?? null);
      setShowCovering(initialData.showCovering || false);
      setCoveringMaterial(initialData.coveringMaterial || "plywood");
      setPlywoodThickness(initialData.plywoodThickness || 6);
      setShowHorizontalSpacers(initialData.showHorizontalSpacers !== false);
      setLanguage(initialData.language || 'en');
      if (initialData.selectedBinId) {
        setSelectedBinId(initialData.selectedBinId);
      }
    }
  }, [projectId]);
  
  // Load frames when selected bin changes
  useEffect(() => {
    loadBinFrames();
  }, [selectedBinId]);

  // Auto-save state changes
  useEffect(() => {
    if (onDataChange) {
      onDataChange({
        width,
        height,
        slatWidth,
        slatDepth,
        supportSpacing,
        selectedSupport,
        showCovering,
        coveringMaterial,
        plywoodThickness,
        showHorizontalSpacers,
        language,
        selectedBinId,
      });
    }
  }, [width, height, slatWidth, slatDepth, supportSpacing, selectedSupport, showCovering, 
      coveringMaterial, plywoodThickness, showHorizontalSpacers, language, selectedBinId]);

  useEffect(() => {
    if (coveringMaterial === "plywood") {
      if (width < 1220) {
        setSupportSpacing(2440 - (slatDepth / 2) - slatDepth);
      } else {
        setSupportSpacing(1220 - (slatDepth / 2) - slatDepth);
      }
    } else if (coveringMaterial === "fabric") {
      setSupportSpacing(500);
    }
  }, [coveringMaterial, width, slatDepth]);

  useEffect(() => {
    drawBlinds();
  }, [width, height, slatWidth, slatDepth, supportSpacing, selectedSupport, showCovering, showHorizontalSpacers, coveringMaterial]);

  const addToBin = async () => {
    if (!selectedBinId) {
      toast({ title: "Please select or create a bin first", variant: "destructive" });
      return;
    }
    
    const { error } = await supabase
      .from('bin_frames')
      .insert({
        bin_id: selectedBinId,
        name: `Frame_${height}X${width}`,
        width,
        height,
        slat_width: slatWidth,
        slat_depth: slatDepth,
        support_spacing: supportSpacing,
        covering_material: coveringMaterial,
        plywood_thickness: plywoodThickness,
      });
    
    if (error) {
      console.error('Error adding to bin:', error);
      toast({ title: "Error adding frame to bin", variant: "destructive" });
      return;
    }
    
    toast({ title: "Frame added to bin successfully" });
    await loadBinFrames();
  };
  
  const exportBin = () => {
    if (bin.length === 0) {
      alert(t.binEmpty);
      return;
    }
    
    // Group identical frames
    const groupedFrames = bin.reduce((acc, frame) => {
      const key = `${frame.width}-${frame.height}-${frame.slatWidth}-${frame.slatDepth}-${frame.supportSpacing}-${frame.coveringMaterial}-${frame.plywoodThickness}`;
      if (!acc[key]) {
        acc[key] = { frame, count: 0 };
      }
      acc[key].count++;
      return acc;
    }, {} as Record<string, { frame: FrameData, count: number }>);
    
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Bin Cut List", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Total Frames: ${bin.length}`, 14, 37);
    
    let startY = 50;
    
    Object.values(groupedFrames).forEach((group, index) => {
      const frame = group.frame;
      const count = group.count;
      
      // Frame header
      doc.setFontSize(14);
      doc.text(`Frame ${index + 1}: ${frame.name} x${count}`, 14, startY);
      doc.setFontSize(10);
      doc.text(`${frame.width/10}cm × ${frame.height/10}cm`, 14, startY + 5);
      
      // Add frame sketch
      const sketchData = drawFrameSketch(frame);
      if (sketchData) {
        doc.addImage(sketchData, 'PNG', 140, startY - 10, 60, 45);
      }
      
      // Board Cut List
      const verticalWidth = frame.height;
      const verticalHeight = frame.slatWidth;
      const horizontalWidth = frame.width - 2 * frame.slatDepth;
      const horizontalHeight = frame.slatWidth;
      const additionalHorizontals = frame.coveringMaterial !== "none" && frame.height > frame.supportSpacing 
        ? Math.floor((frame.height - 2 * frame.slatDepth) / frame.supportSpacing) 
        : 0;
      
      const boardTableData = [
        [verticalWidth/10, verticalHeight/10, frame.slatDepth/10, 2 * count],
        [horizontalWidth/10, horizontalHeight/10, frame.slatDepth/10, (2 + additionalHorizontals) * count],
      ];
      
      autoTable(doc, {
        startY: startY + 40,
        head: [["Height (cm)", "Width (cm)", "Depth (cm)", "Qty"]],
        body: boardTableData,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185] },
        margin: { left: 14 },
      });
      
      // Calculate optimal cut list
      const pieces = [
        { length: verticalWidth, qty: 2 * count },
        { length: horizontalWidth, qty: (2 + additionalHorizontals) * count }
      ];
      const cutList = calculateOptimalCutList(pieces);
      
      doc.setFontSize(12);
      doc.text("Optimal Cut List (600cm boards):", 14, (doc as any).lastAutoTable.finalY + 10);
      
      const cutListData = cutList.map((cut, i) => [
        `Board ${i + 1}`,
        cut.cuts.map(c => `${(c/10).toFixed(1)}cm`).join(' + '),
        `${(cut.waste/10).toFixed(1)}cm`,
        `${((cut.boardLength - cut.waste)/cut.boardLength * 100).toFixed(1)}%`
      ]);
      
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [["Board", "Cuts", "Waste", "Efficiency"]],
        body: cutListData,
        theme: "grid",
        headStyles: { fillColor: [34, 197, 94] },
        margin: { left: 14 },
      });
      
      doc.setFontSize(10);
      doc.text(`Total boards needed: ${cutList.length} x 600cm`, 14, (doc as any).lastAutoTable.finalY + 7);
      
      // Plywood or Fabric Cut List
      if (frame.coveringMaterial === "plywood") {
        const plywoodTableData: any[] = [];
        
        if (frame.width < 1220) {
          const standardPlatesQty = Math.floor(frame.height / 2440);
          const remainingHeight = frame.height % 2440;
          
          if (standardPlatesQty > 0) {
            plywoodTableData.push([2440/10, frame.width/10, frame.plywoodThickness, standardPlatesQty * count]);
          }
          
          if (remainingHeight > 0) {
            plywoodTableData.push([remainingHeight/10, frame.width/10, frame.plywoodThickness, 1 * count]);
          }
        } else {
          const plywoodWidth = frame.width;
          const plywoodHeight = frame.supportSpacing - frame.slatDepth;
          const plywoodQty = (1 + additionalHorizontals) * count;
          plywoodTableData.push([plywoodHeight/10, plywoodWidth/10, frame.plywoodThickness, plywoodQty]);
        }
        
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 15,
          head: [["Height (cm)", "Width (cm)", "Depth (mm)", "Qty"]],
          body: plywoodTableData,
          theme: "grid",
          headStyles: { fillColor: [76, 175, 80] },
          margin: { left: 14 },
        });
      }
      
      startY = (doc as any).lastAutoTable.finalY + 15;
      
      // Add new page if needed
      if (startY > 250 && index < Object.values(groupedFrames).length - 1) {
        doc.addPage();
        startY = 20;
      }
    });
    
    doc.save(`bin-cutlist-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const downloadCutList = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Cut List - Wooden Blind", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Frame: ${width/10}cm × ${height/10}cm`, 14, 30);
    doc.text(`Board Depth: ${slatDepth}mm`, 14, 37);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);
    
    // Vertical boards - rotate so longer side is width
    const verticalWidth = height;
    const verticalHeight = slatWidth;
    
    // Horizontal boards - rotate so longer side is width
    const horizontalWidth = width - 2 * slatDepth;
    const horizontalHeight = slatWidth;
    
    // Calculate additional horizontal boards needed based on supportSpacing
    const additionalHorizontals = coveringMaterial !== "none" && height > supportSpacing 
      ? Math.floor((height - 2 * slatDepth) / supportSpacing) 
      : 0;
    
    // Board Cut List
    doc.setFontSize(14);
    doc.text("Board Cut List", 14, 55);
    
    const boardTableData = [
      [verticalWidth/10, verticalHeight/10, slatDepth/10, 2],
      [horizontalWidth/10, horizontalHeight/10, slatDepth/10, 2 + additionalHorizontals],
    ];
    
    autoTable(doc, {
      startY: 60,
      head: [["Height (cm)", "Width (cm)", "Depth (cm)", "Quantity"]],
      body: boardTableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] },
    });
    
    // Plywood Cut List (if plywood is selected)
    if (coveringMaterial === "plywood") {
      const plywoodTableData: any[] = [];
      
      if (width < 1220) {
        // Calculate plywood plates based on 2440mm standard height
        const standardPlatesQty = Math.floor(height / 2440);
        const remainingHeight = height % 2440;
        
        // Add standard plates (Width x 2440mm)
        if (standardPlatesQty > 0) {
          plywoodTableData.push([2440/10, width/10, plywoodThickness, standardPlatesQty]);
        }
        
        // Add remaining plate if there's a remainder
        if (remainingHeight > 0) {
          plywoodTableData.push([remainingHeight/10, width/10, plywoodThickness, 1]);
        }
      } else {
        // Original logic for width >= 122
        const plywoodWidth = width;
        const plywoodHeight = supportSpacing - slatDepth;
        const plywoodQty = 1 + additionalHorizontals;
        plywoodTableData.push([plywoodHeight/10, plywoodWidth/10, plywoodThickness, plywoodQty]);
      }
      
      const finalY = (doc as any).lastAutoTable.finalY || 60;
      
      doc.setFontSize(14);
      doc.text("Plywood Cut List", 14, finalY + 10);
      
      autoTable(doc, {
        startY: finalY + 15,
        head: [["Height (cm)", "Width (cm)", "Depth (mm)", "Quantity"]],
        body: plywoodTableData,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185] },
      });
    }
    
    // Fabric Cut List (if fabric is selected)
    if (coveringMaterial === "fabric") {
      const fabricWidth = width - 2 * slatDepth;
      const fabricHeight = supportSpacing - slatDepth;
      const fabricQty = 1 + additionalHorizontals;
      
      const finalY = (doc as any).lastAutoTable.finalY || 60;
      
      doc.setFontSize(14);
      doc.text("Fabric Cut List", 14, finalY + 10);
      
      const fabricTableData = [
        [fabricWidth/10, fabricHeight/10, "-", fabricQty],
      ];
      
      autoTable(doc, {
        startY: finalY + 15,
        head: [["Width (cm)", "Height (cm)", "Depth (cm)", "Quantity"]],
        body: fabricTableData,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185] },
      });
    }
    
    doc.save(`cutlist-${width}x${height}.pdf`);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Calculate scale and offsets (same as in drawBlinds)
    const scale = Math.min(
      (canvas.width - 80) / width,
      (canvas.height - 80) / height
    );
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;
    const scaledDepth = slatDepth * scale;

    // Check if click is on any horizontal support
    const additionalHorizontals = coveringMaterial !== "none" && height > supportSpacing 
      ? Math.floor((height - 2 * slatDepth) / supportSpacing) 
      : 0;
    
    // Calculate effective spacing for click detection
    const availableHeight = height - 2 * slatDepth;
    const effectiveSpacing = (coveringMaterial === "fabric" && additionalHorizontals > 0)
      ? availableHeight / (additionalHorizontals + 1)
      : supportSpacing;
    
    for (let i = 1; i <= additionalHorizontals; i++) {
      const baseY = offsetY + scaledHeight - scaledDepth - (i * effectiveSpacing * scale);
      const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * scaledDepth) : 0;
      const supportY = baseY - additionalOffset;
      const supportX = offsetX + scaledDepth;
      const supportWidth = scaledWidth - 2 * scaledDepth;
      const supportHeight = scaledDepth;

      // Check if click is within this support's bounds
      if (
        clickX >= supportX &&
        clickX <= supportX + supportWidth &&
        clickY >= supportY &&
        clickY <= supportY + supportHeight
      ) {
        // Toggle selection: if already selected, deselect; otherwise select
        setSelectedSupport(selectedSupport === i ? null : i);
        return;
      }
    }

    // If no support was clicked, deselect
    setSelectedSupport(null);
  };

  const drawBlinds = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale to fit canvas
    const scale = Math.min(
      (canvas.width - 80) / width,
      (canvas.height - 80) / height
    );

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2 + 15;

    // Draw frame as separate rectangles with depth
    const scaledDepth = slatDepth * scale;
    
    ctx.shadowColor = "hsl(199, 89%, 48%)";
    ctx.shadowBlur = 10;
    
    // Left side (depth × height)
    const leftGradient = ctx.createLinearGradient(offsetX, offsetY, offsetX + scaledDepth, offsetY);
    leftGradient.addColorStop(0, "hsl(199, 70%, 35%)");
    leftGradient.addColorStop(1, "hsl(199, 80%, 45%)");
    ctx.fillStyle = leftGradient;
    ctx.fillRect(offsetX, offsetY, scaledDepth, scaledHeight);
    ctx.strokeStyle = "hsl(199, 89%, 48%)";
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX, offsetY, scaledDepth, scaledHeight);
    
    // Top side (width × depth)
    const topGradient = ctx.createLinearGradient(offsetX, offsetY, offsetX, offsetY + scaledDepth);
    topGradient.addColorStop(0, "hsl(199, 85%, 50%)");
    topGradient.addColorStop(1, "hsl(199, 75%, 40%)");
    ctx.fillStyle = topGradient;
    ctx.fillRect(offsetX + scaledDepth, offsetY, scaledWidth - 2 * scaledDepth, scaledDepth);
    ctx.strokeStyle = "hsl(199, 89%, 48%)";
    ctx.strokeRect(offsetX + scaledDepth, offsetY, scaledWidth - 2 * scaledDepth, scaledDepth);
    
    // Right side (depth × height)
    const rightGradient = ctx.createLinearGradient(offsetX + scaledWidth - scaledDepth, offsetY, offsetX + scaledWidth, offsetY);
    rightGradient.addColorStop(0, "hsl(199, 80%, 45%)");
    rightGradient.addColorStop(1, "hsl(199, 60%, 30%)");
    ctx.fillStyle = rightGradient;
    ctx.fillRect(offsetX + scaledWidth - scaledDepth, offsetY, scaledDepth, scaledHeight);
    ctx.strokeStyle = "hsl(199, 89%, 48%)";
    ctx.strokeRect(offsetX + scaledWidth - scaledDepth, offsetY, scaledDepth, scaledHeight);
    
    // Bottom side (width × depth)
    const bottomGradient = ctx.createLinearGradient(offsetX, offsetY + scaledHeight - scaledDepth, offsetX, offsetY + scaledHeight);
    bottomGradient.addColorStop(0, "hsl(199, 75%, 40%)");
    bottomGradient.addColorStop(1, "hsl(199, 65%, 35%)");
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(offsetX + scaledDepth, offsetY + scaledHeight - scaledDepth, scaledWidth - 2 * scaledDepth, scaledDepth);
    ctx.strokeStyle = "hsl(199, 89%, 48%)";
    ctx.strokeRect(offsetX + scaledDepth, offsetY + scaledHeight - scaledDepth, scaledWidth - 2 * scaledDepth, scaledDepth);

    // Draw additional horizontal supports based on supportSpacing or evenly distributed
    const additionalHorizontals = coveringMaterial !== "none" && height > supportSpacing 
      ? Math.floor((height - 2 * slatDepth) / supportSpacing) 
      : 0;
    
    // Calculate spacing: either even distribution or fixed spacing
    const availableHeight = height - 2 * slatDepth;
    const effectiveSpacing = (coveringMaterial === "fabric" && additionalHorizontals > 0)
      ? availableHeight / (additionalHorizontals + 1)
      : supportSpacing;
    
    for (let i = 1; i <= additionalHorizontals; i++) {
      const baseY = offsetY + scaledHeight - scaledDepth - (i * effectiveSpacing * scale);
      const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
      const supportY = baseY - additionalOffset;
      const supportGradient = ctx.createLinearGradient(offsetX, supportY, offsetX, supportY + scaledDepth);
      
      // Highlight selected support
      if (selectedSupport === i) {
        supportGradient.addColorStop(0, "hsl(45, 100%, 60%)"); // Bright yellow/gold
        supportGradient.addColorStop(1, "hsl(45, 100%, 50%)");
      } else {
        supportGradient.addColorStop(0, "hsl(199, 85%, 50%)");
        supportGradient.addColorStop(1, "hsl(199, 75%, 40%)");
      }
      
      ctx.fillStyle = supportGradient;
      ctx.fillRect(offsetX + scaledDepth, supportY, scaledWidth - 2 * scaledDepth, scaledDepth);
      ctx.strokeStyle = selectedSupport === i ? "hsl(45, 100%, 70%)" : "hsl(199, 89%, 48%)";
      ctx.lineWidth = selectedSupport === i ? 3 : 2;
      ctx.strokeRect(offsetX + scaledDepth, supportY, scaledWidth - 2 * scaledDepth, scaledDepth);
    }


    // Draw dimension arrows between horizontal supports
    if (showHorizontalSpacers) {
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "hsl(199, 89%, 48%)";
      ctx.shadowBlur = 5;
      
      const bottomSupportY = offsetY + scaledHeight - scaledDepth;
      for (let i = 1; i <= additionalHorizontals; i++) {
        const baseY = offsetY + scaledHeight - scaledDepth - (i * effectiveSpacing * scale);
        const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
        const currentSupportY = baseY - additionalOffset; // top of current support
        const arrowX = offsetX + scaledWidth + 30;
        const prevBaseY = offsetY + scaledHeight - scaledDepth - ((i - 1) * effectiveSpacing * scale);
        const prevAdditionalOffset = (coveringMaterial === "plywood" && width > 1220 && (i - 1) > 1) ? ((i - 1) * slatDepth * scale) : 0;
        const prevSupportTop = i === 1 ? bottomSupportY : (prevBaseY - prevAdditionalOffset);
        const startY = i === 1 ? bottomSupportY + scaledDepth : prevSupportTop + scaledDepth; // measure from bottom of previous support
        const endY = currentSupportY; // to top of current support (clear gap)
        
        // Draw vertical line
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX, endY);
        ctx.stroke();
        
        // Draw arrows
        const arrowSize = 8;
        ctx.setLineDash([]);
        ctx.fillStyle = "hsl(199, 89%, 48%)";
        
        // Top arrow (near previous element)
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX - arrowSize / 2, startY + arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, startY + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Bottom arrow (near current support)
        ctx.beginPath();
        ctx.moveTo(arrowX, endY);
        ctx.lineTo(arrowX - arrowSize / 2, endY - arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, endY - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        ctx.setLineDash([5, 5]);
        
        // Draw dimension text (clear gap between supports)
        // Calculate actual distance in pixels and convert to mm
        const actualDistance = (startY - endY) / scale;
        
        ctx.fillStyle = "hsl(0, 0%, 100%)";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.shadowBlur = 15;
        
        ctx.save();
        ctx.translate(arrowX + 25, (startY + endY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${(actualDistance/10).toFixed(1)}cm`, 0, 0);
        ctx.restore();
      }
      
      // Draw dimension arrow for the last segment (from last support to top)
      if (additionalHorizontals > 0) {
        const lastBaseY = offsetY + scaledHeight - scaledDepth - (additionalHorizontals * effectiveSpacing * scale);
        const lastAdditionalOffset = (coveringMaterial === "plywood" && width > 1220 && additionalHorizontals > 1) ? (additionalHorizontals * slatDepth * scale) : 0;
        const lastSupportY = lastBaseY - lastAdditionalOffset;
        const topY = offsetY + scaledDepth;
        const startY = lastSupportY + scaledDepth; // measure from bottom of last support
        const endY = topY; // to bottom of top frame
        // Calculate actual distance in pixels and convert to mm
        const lastSegmentDistance = (startY - endY) / scale;
        const arrowX = offsetX + scaledWidth + 30;
        
        // Draw vertical line
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX, endY);
        ctx.stroke();
        
        // Draw arrows
        const arrowSize = 8;
        ctx.setLineDash([]);
        ctx.fillStyle = "hsl(199, 89%, 48%)";
        
        // Top arrow (near top frame)
        ctx.beginPath();
        ctx.moveTo(arrowX, endY);
        ctx.lineTo(arrowX - arrowSize / 2, endY + arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, endY + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Bottom arrow (near last support)
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX - arrowSize / 2, startY - arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, startY - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Draw dimension text
        ctx.fillStyle = "hsl(0, 0%, 100%)";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.shadowBlur = 15;
        
        ctx.save();
        ctx.translate(arrowX + 25, (startY + endY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${(lastSegmentDistance/10).toFixed(1)}cm`, 0, 0);
        ctx.restore();
      }
    }
    
    ctx.setLineDash([]);

    // Draw plywood covering on top of frame with random semi-transparent colors
    if (showCovering && coveringMaterial === "plywood") {
      ctx.shadowBlur = 0;
      
      // Frame boundaries - cover the entire frame
      const frameTop = offsetY;
      const frameBottom = offsetY + scaledHeight;
      const frameLeft = offsetX;
      const frameRight = offsetX + scaledWidth;
      
      // Draw plywood panels between horizontal supports (starting from bottom)
      for (let i = 0; i <= additionalHorizontals; i++) {
        // Generate random color for each panel
        const hue = Math.floor(Math.random() * 360);
        const saturation = Math.floor(Math.random() * 30) + 20; // 20-50%
        const lightness = Math.floor(Math.random() * 30) + 40; // 40-70%
        
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;
        
        // Calculate panel position
        let panelY, panelHeight;
        
        if (i === 0) {
          // First panel (frame bottom to first support from bottom)
          const firstSupportY = frameBottom - (supportSpacing * scale);
          panelY = firstSupportY;
          panelHeight = supportSpacing * scale;
        } else {
          // Calculate previous support position
          const prevBaseY = offsetY + scaledHeight - scaledDepth - ((i - 1) * supportSpacing * scale);
          const prevAdditionalOffset = (width > 1220 && (i - 1) > 1) ? ((i - 1) * slatDepth * scale) : 0;
          const prevSupportBottom = prevBaseY - prevAdditionalOffset;
          
          if (i === additionalHorizontals) {
            // Last panel (last support to frame top)
            panelHeight = prevSupportBottom - frameTop;
            panelY = frameTop;
          } else {
            // Middle panels (between supports)
            const currentBaseY = offsetY + scaledHeight - scaledDepth - (i * supportSpacing * scale);
            const currentAdditionalOffset = (width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
            const currentSupportBottom = currentBaseY - currentAdditionalOffset + scaledDepth;
            panelHeight = prevSupportBottom - currentSupportBottom;
            panelY = currentSupportBottom;
          }
        }
        
        // Constrain to frame boundaries
        if (panelY < frameTop) {
          panelHeight -= (frameTop - panelY);
          panelY = frameTop;
        }
        if (panelY + panelHeight > frameBottom) {
          panelHeight = frameBottom - panelY;
        }
        
        // Draw the plywood panel only if within frame
        if (panelHeight > 0) {
          ctx.fillRect(
            frameLeft,
            panelY,
            frameRight - frameLeft,
            panelHeight
          );
        }
      }
      
      ctx.shadowBlur = 10;
    }

    // Draw dimension lines
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.shadowBlur = 5;

    // Width dimension
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY - 20);
    ctx.lineTo(offsetX + scaledWidth, offsetY - 20);
    ctx.stroke();
    
    // Height dimension
    ctx.beginPath();
    ctx.moveTo(offsetX - 20, offsetY);
    ctx.lineTo(offsetX - 20, offsetY + scaledHeight);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw dimension text
    ctx.fillStyle = "hsl(0, 0%, 100%)";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.shadowBlur = 15;
    ctx.fillText(`${width/10}cm`, offsetX + scaledWidth / 2, offsetY - 25);
    
    ctx.save();
    ctx.translate(offsetX - 30, offsetY + scaledHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${height/10}cm`, 0, 0);
    ctx.restore();

    ctx.shadowBlur = 0;
  };

  return (
    <div className="min-h-screen bg-background bg-blueprint-grid bg-grid p-8" dir={language === 'he' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-foreground tracking-wider" style={{ textShadow: "var(--glow)" }}>
            {t.title}
          </h1>
          <div className="flex items-center gap-4">
            {onSave && (
              <Button onClick={onSave} variant="outline">
                Save
              </Button>
            )}
            <LanguageSelector language={language} onLanguageChange={setLanguage} />
          </div>
        </div>
        <p className="text-muted-foreground mb-8 font-mono uppercase tracking-wide text-sm">
          {t.subtitle}
        </p>

        {/* Bin Management */}
        <Card className="p-4 mb-6 bg-card border-border shadow-lg">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="selectedBin" className="text-sm font-mono uppercase tracking-wider mb-2 block">
                Select Bin
              </Label>
              <Select value={selectedBinId || ""} onValueChange={setSelectedBinId}>
                <SelectTrigger id="selectedBin" className="w-full">
                  <SelectValue placeholder="Select a bin" />
                </SelectTrigger>
                <SelectContent className="bg-card z-50">
                  {bins.map((bin) => (
                    <SelectItem key={bin.id} value={bin.id}>
                      {bin.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Dialog open={showNewBinDialog} onOpenChange={setShowNewBinDialog}>
              <DialogTrigger asChild>
                <Button
                  className="font-mono uppercase tracking-wider"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Bin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Bin</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="newBinName">Bin Name</Label>
                    <Input
                      id="newBinName"
                      value={newBinName}
                      onChange={(e) => setNewBinName(e.target.value)}
                      placeholder="Enter bin name"
                      className="mt-2"
                    />
                  </div>
                  <Button onClick={createNewBin} className="w-full">
                    Create Bin
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={showEditBinDialog} onOpenChange={setShowEditBinDialog}>
              <DialogTrigger asChild>
                <Button
                  className="font-mono uppercase tracking-wider"
                  variant="outline"
                  disabled={!selectedBinId}
                  onClick={() => {
                    const currentBin = bins.find(b => b.id === selectedBinId);
                    setEditBinName(currentBin?.name || "");
                  }}
                >
                  Edit Bin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Bin Name</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="editBinName">Bin Name</Label>
                    <Input
                      id="editBinName"
                      value={editBinName}
                      onChange={(e) => setEditBinName(e.target.value)}
                      placeholder="Enter bin name"
                      className="mt-2"
                    />
                  </div>
                  <Button onClick={editBin} className="w-full">
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              onClick={() => selectedBinId && deleteBin(selectedBinId)}
              className="font-mono uppercase tracking-wider"
              variant="destructive"
              disabled={!selectedBinId}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Bin
            </Button>
            
            <Dialog open={showBinDialog} onOpenChange={setShowBinDialog}>
              <DialogTrigger asChild>
                <Button
                  className="font-mono uppercase tracking-wider"
                  variant="outline"
                  disabled={bin.length === 0}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t.viewBin} ({bin.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>{t.frameBin}</span>
                    <Button
                      onClick={exportBin}
                      className="font-mono uppercase tracking-wider"
                      variant="outline"
                      size="sm"
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      {t.exportBin}
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {(() => {
                    // Group identical frames
                    const groupedFrames = bin.reduce((acc, frame, originalIndex) => {
                      const key = `${frame.width}-${frame.height}-${frame.slatWidth}-${frame.slatDepth}-${frame.supportSpacing}-${frame.coveringMaterial}-${frame.plywoodThickness}`;
                      if (!acc[key]) {
                        acc[key] = { frame, count: 0, indices: [] };
                      }
                      acc[key].count++;
                      acc[key].indices.push(originalIndex);
                      return acc;
                    }, {} as Record<string, { frame: typeof bin[0], count: number, indices: number[] }>);

                    return Object.values(groupedFrames).map((group, groupIndex) => (
                      <Card key={groupIndex} className="p-4 bg-secondary">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-mono font-semibold text-lg">{group.frame.name}</h3>
                            <span className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm font-mono">
                              x{group.count}
                            </span>
                          </div>
                          <Button
                            onClick={async () => {
                              // Delete all instances of this grouped frame from database
                              const frameIds = group.indices
                                .map(i => bin[i].id)
                                .filter((id): id is string => id !== undefined);
                              
                              if (frameIds.length === 0) return;
                              
                              const { error } = await supabase
                                .from('bin_frames')
                                .delete()
                                .in('id', frameIds);
                              
                              if (error) {
                                console.error('Error deleting frames:', error);
                                toast({ title: "Error deleting frames", variant: "destructive" });
                                return;
                              }
                              
                              toast({ title: "Frames deleted successfully" });
                              await loadBinFrames();
                            }}
                            variant="ghost"
                            size="sm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                          <div>Width: {group.frame.width/10}cm</div>
                          <div>Height: {group.frame.height/10}cm</div>
                          <div>Board Width: {group.frame.slatWidth/10}cm</div>
                          <div>Board Depth: {(group.frame.slatDepth/10).toFixed(1)}cm</div>
                          <div>Support Spacing: {group.frame.supportSpacing/10}cm</div>
                          <div>Material: {group.frame.coveringMaterial}</div>
                          {group.frame.coveringMaterial === "plywood" && (
                            <div>Plywood: {(group.frame.plywoodThickness/10).toFixed(1)}cm</div>
                          )}
                        </div>
                        
                        {/* Uncut Board Requirements */}
                        <div className="mt-3 pt-3 border-t border-border">
                          <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Uncut Boards (600cm)</h4>
                          {(() => {
                            const verticalWidth = group.frame.height;
                            const horizontalWidth = group.frame.width - 2 * group.frame.slatDepth;
                            const additionalHorizontals = group.frame.coveringMaterial !== "none" && group.frame.height > group.frame.supportSpacing 
                              ? Math.floor((group.frame.height - 2 * group.frame.slatDepth) / group.frame.supportSpacing) 
                              : 0;
                            
                            const pieces = [
                              { length: verticalWidth, qty: 2 * group.count },
                              { length: horizontalWidth, qty: (2 + additionalHorizontals) * group.count }
                            ];
                            const cutList = calculateOptimalCutList(pieces);
                            
                            return (
                              <div className="text-sm font-mono">
                                <div className="flex justify-between">
                                  <span>Total boards:</span>
                                  <span className="font-semibold">{cutList.length}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                  <span>Total length:</span>
                                  <span>{(cutList.length * 600 / 100).toFixed(1)}m</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </Card>
                    ));
                  })()}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </Card>

        <div className="grid lg:grid-cols-[300px_1fr_400px] gap-8">
          {/* Left Panel - Frame Covering & Support Spacing */}
          <div className="space-y-6">
            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                {t.coveringMaterial}
              </h2>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="coveringMaterial" className="text-sm font-mono uppercase tracking-wider">
                    {t.material}
                  </Label>
                  <Select value={coveringMaterial} onValueChange={(value) => setCoveringMaterial(value as "none" | "fabric" | "plywood")}>
                    <SelectTrigger id="coveringMaterial" className="w-full">
                      <SelectValue placeholder={t.selectMaterial} />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      <SelectItem value="none">{t.none}</SelectItem>
                      <SelectItem value="fabric">{t.fabric}</SelectItem>
                      <SelectItem value="plywood">{t.plywood}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border shadow-lg opacity-50 pointer-events-none" style={coveringMaterial === "plywood" ? {} : { opacity: 1, pointerEvents: 'auto' }}>
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                {t.supportSpacing}
              </h2>

              <div className="space-y-6">
                {/* Support Spacing Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="supportSpacing" className="text-sm font-mono uppercase tracking-wider">
                      {t.spacing}
                    </Label>
                    <Input
                      id="supportSpacing"
                      type="number"
                      value={supportSpacing}
                      onChange={(e) => setSupportSpacing(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={400}
                      max={640}
                      disabled={coveringMaterial === "plywood"}
                    />
                  </div>
                  <Slider
                    value={[supportSpacing]}
                    onValueChange={(value) => setSupportSpacing(value[0])}
                    min={400}
                    max={640}
                    step={10}
                    className="w-full"
                    disabled={coveringMaterial === "plywood"}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>40cm</span>
                    <span>64cm</span>
                  </div>
                </div>

                {/* Distribute Evenly Checkbox - only for fabric */}
              </div>
            </Card>
          </div>

          {/* Canvas */}
          <Card className="p-6 border-border shadow-lg bg-transparent">
            <h2 className="text-xl font-semibold mb-4 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
              {t.preview}
            </h2>
            
            <div className="mb-4 flex items-center gap-6">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="showHorizontalSpacers"
                  checked={showHorizontalSpacers}
                  onCheckedChange={(checked) => setShowHorizontalSpacers(checked as boolean)}
                />
                <Label
                  htmlFor="showHorizontalSpacers"
                  className="text-sm font-mono uppercase tracking-wider cursor-pointer"
                >
                  {t.showHorizontalSpacers}
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="showCovering"
                  checked={showCovering}
                  onCheckedChange={(checked) => setShowCovering(checked as boolean)}
                />
                <Label
                  htmlFor="showCovering"
                  className="text-sm font-mono uppercase tracking-wider cursor-pointer"
                >
                  {t.showCovering}
                </Label>
              </div>
            </div>
            
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="w-full h-auto border border-border rounded bg-transparent"
              onClick={handleCanvasClick}
            />
            
            <div className="mt-4 flex justify-center">
              <Button
                onClick={addToBin}
                className="font-mono uppercase tracking-wider"
                variant="default"
                disabled={!selectedBinId}
                size="lg"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.addToBin}
              </Button>
            </div>
            
            <div className="mt-4 space-y-4">
              <div className="text-sm text-muted-foreground font-mono">
                <div className="flex justify-between">
                  <span>{t.scale}</span>
                  <span>{t.area}: {((width * height) / 1000000).toFixed(2)}m²</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-sm font-mono uppercase tracking-wider text-foreground">{t.cutLists}</h3>
                
                {/* Board Cut List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{t.boardCutList}</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm font-mono">
                      <thead>
                        <tr className="bg-primary/10 border-b border-border">
                          <th className="px-4 py-2 text-left text-foreground">{t.height}</th>
                          <th className="px-4 py-2 text-left text-foreground">{t.width}</th>
                          <th className="px-4 py-2 text-left text-foreground">{t.depth}</th>
                          <th className="px-4 py-2 text-left text-foreground">{t.quantity}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="px-4 py-2 text-foreground">{height/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatWidth/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatDepth/10}</td>
                          <td className="px-4 py-2 text-foreground">2</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-foreground">{(width - 2 * slatDepth)/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatWidth/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatDepth/10}</td>
                          <td className="px-4 py-2 text-foreground">{2 + (coveringMaterial !== "none" && height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Plywood Cut List */}
                {coveringMaterial === "plywood" && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{t.plywoodCutList}</h4>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm font-mono">
                        <thead>
                          <tr className="bg-primary/10 border-b border-border">
                            <th className="px-4 py-2 text-left text-foreground">{t.height}</th>
                            <th className="px-4 py-2 text-left text-foreground">{t.width}</th>
                            <th className="px-4 py-2 text-left text-foreground">{t.depth} (mm)</th>
                            <th className="px-4 py-2 text-left text-foreground">{t.quantity}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {width < 1220 ? (
                            <tr>
                              <td className="px-4 py-2 text-foreground">{height/10}</td>
                              <td className="px-4 py-2 text-foreground">{width/10}</td>
                              <td className="px-4 py-2 text-foreground">{plywoodThickness}</td>
                              <td className="px-4 py-2 text-foreground">1</td>
                            </tr>
                          ) : (
                            <tr>
                              <td className="px-4 py-2 text-foreground">{(supportSpacing - slatDepth)/10}</td>
                              <td className="px-4 py-2 text-foreground">{width/10}</td>
                              <td className="px-4 py-2 text-foreground">{plywoodThickness}</td>
                              <td className="px-4 py-2 text-foreground">{1 + (height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* Fabric Cut List */}
                {coveringMaterial === "fabric" && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Fabric Cut List</h4>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm font-mono">
                        <thead>
                          <tr className="bg-primary/10 border-b border-border">
                            <th className="px-4 py-2 text-left text-foreground">Width (cm)</th>
                            <th className="px-4 py-2 text-left text-foreground">Height (cm)</th>
                            <th className="px-4 py-2 text-left text-foreground">Depth (cm)</th>
                            <th className="px-4 py-2 text-left text-foreground">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-4 py-2 text-foreground">{(width - 2 * slatDepth)/10}</td>
                            <td className="px-4 py-2 text-foreground">{(() => {
                              const additionalHorizontals = height > supportSpacing 
                                ? Math.floor((height - 2 * slatDepth) / supportSpacing) 
                                : 0;
                              const availableHeight = height - 2 * slatDepth;
                              const effectiveSpacing = additionalHorizontals > 0
                                ? availableHeight / (additionalHorizontals + 1)
                                : supportSpacing;
                              return ((effectiveSpacing - slatDepth)/10).toFixed(1);
                            })()}</td>
                            <td className="px-4 py-2 text-foreground">-</td>
                            <td className="px-4 py-2 text-foreground">{1 + (height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Controls */}
          <div className="space-y-6">
            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                {t.frameDimensions}
              </h2>

              <div className="space-y-6">
                {/* Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="width" className="text-sm font-mono uppercase tracking-wider">
                      {t.width}
                    </Label>
                    <Input
                      id="width"
                      type="number"
                      value={width / 10}
                      onChange={(e) => setWidth(Number(e.target.value) * 10)}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={50}
                      max={160}
                      step={0.1}
                    />
                  </div>
                  <Slider
                    value={[width]}
                    onValueChange={(value) => setWidth(value[0])}
                    min={500}
                    max={1600}
                    step={10}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>50cm</span>
                    <span>160cm</span>
                  </div>
                </div>

                {/* Height Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="height" className="text-sm font-mono uppercase tracking-wider">
                      {t.height}
                    </Label>
                    <Input
                      id="height"
                      type="number"
                      value={height / 10}
                      onChange={(e) => setHeight(Number(e.target.value) * 10)}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={10}
                      max={400}
                      step={0.1}
                    />
                  </div>
                  <Slider
                    value={[height]}
                    onValueChange={(value) => setHeight(value[0])}
                    min={100}
                    max={4000}
                    step={10}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>10cm</span>
                    <span>400cm</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                {t.boardDimensions}
              </h2>

              <div className="space-y-6">
                {/* Slat Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatWidth" className="text-sm font-mono uppercase tracking-wider">
                      {t.boardHeight}
                    </Label>
                    <Input
                      id="slatWidth"
                      type="number"
                      value={slatWidth}
                      onChange={(e) => setSlatWidth(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={20}
                      max={100}
                    />
                  </div>
                  <Slider
                    value={[slatWidth]}
                    onValueChange={(value) => setSlatWidth(value[0])}
                    min={20}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>2cm</span>
                    <span>10cm</span>
                  </div>
                </div>

                {/* Slat Depth Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatDepth" className="text-sm font-mono uppercase tracking-wider">
                      {t.boardDepth}
                    </Label>
                    <Input
                      id="slatDepth"
                      type="number"
                      value={slatDepth}
                      onChange={(e) => setSlatDepth(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={16}
                      max={25}
                    />
                  </div>
                  <Slider
                    value={[slatDepth]}
                    onValueChange={(value) => setSlatDepth(value[0])}
                    min={16}
                    max={25}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>16mm</span>
                    <span>25mm</span>
                  </div>
                </div>
              </div>
            </Card>

            {coveringMaterial === "plywood" && (
              <Card className="p-6 bg-card border-border shadow-lg">
                <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                  {t.plywoodDimensions}
                </h2>

                <div className="space-y-6">
                  {/* Plywood Thickness Control */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="plywoodThickness" className="text-sm font-mono uppercase tracking-wider">
                        {t.thickness}
                      </Label>
                      <Input
                        id="plywoodThickness"
                        type="number"
                        value={plywoodThickness}
                        onChange={(e) => setPlywoodThickness(Number(e.target.value))}
                        className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                        min={3}
                        max={25}
                      />
                    </div>
                    <Slider
                      value={[plywoodThickness]}
                      onValueChange={(value) => setPlywoodThickness(value[0])}
                      min={3}
                      max={25}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                      <span>3mm</span>
                      <span>25mm</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default BlindGenerator;
