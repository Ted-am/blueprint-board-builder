import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BlindGenerator = () => {
  const [width, setWidth] = useState(500); // mm
  const [height, setHeight] = useState(2000); // mm
  const [slatWidth, setSlatWidth] = useState(25); // mm board width
  const [slatDepth, setSlatDepth] = useState(20); // mm board depth
  const [supportSpacing, setSupportSpacing] = useState(500); // mm spacing between horizontal supports
  const [selectedSupport, setSelectedSupport] = useState<number | null>(null); // index of selected horizontal support (1-based, null = none)
  const [showCovering, setShowCovering] = useState(false); // show frame covering
  const [coveringMaterial, setCoveringMaterial] = useState<string>("plywood"); // covering material type
  const [plywoodThickness, setPlywoodThickness] = useState(6); // mm plywood thickness
  const [showHorizontalSpacers, setShowHorizontalSpacers] = useState(true); // show horizontal spacers
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
  }, [width, height, slatWidth, slatDepth, supportSpacing, selectedSupport, showCovering, showHorizontalSpacers]);

  const downloadCutList = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Cut List - Wooden Blind", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Frame: ${width/10}cm × ${height/10}cm`, 14, 30);
    doc.text(`Board Depth: ${slatDepth/10}cm`, 14, 37);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);
    
    // Vertical boards - rotate so longer side is width
    const verticalWidth = height - 2 * slatDepth;
    const verticalHeight = slatWidth;
    
    // Horizontal boards - rotate so longer side is width
    const horizontalWidth = width - 2 * slatDepth;
    const horizontalHeight = slatWidth;
    
    // Calculate additional horizontal boards needed based on supportSpacing
    const additionalHorizontals = height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0;
    
    // Board Cut List
    doc.setFontSize(14);
    doc.text("Board Cut List", 14, 55);
    
    const boardTableData = [
      [verticalWidth/10, verticalHeight/10, slatDepth/10, 2],
      [horizontalWidth/10, horizontalHeight/10, slatDepth/10, 2 + additionalHorizontals],
    ];
    
    autoTable(doc, {
      startY: 60,
      head: [["Width (cm)", "Height (cm)", "Depth (cm)", "Quantity"]],
      body: boardTableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] },
    });
    
    // Plywood Cut List (if plywood is selected)
    if (coveringMaterial === "plywood") {
      const plywoodWidth = width;
      const plywoodHeight = supportSpacing - slatDepth;
      const plywoodQty = 1 + additionalHorizontals;
      
      const finalY = (doc as any).lastAutoTable.finalY || 60;
      
      doc.setFontSize(14);
      doc.text("Plywood Cut List", 14, finalY + 10);
      
      const plywoodTableData = [
        [plywoodWidth/10, plywoodHeight/10, plywoodThickness/10, plywoodQty],
      ];
      
      autoTable(doc, {
        startY: finalY + 15,
        head: [["Width (cm)", "Height (cm)", "Depth (cm)", "Quantity"]],
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
    const additionalHorizontals = height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0;
    
    for (let i = 1; i <= additionalHorizontals; i++) {
      const baseY = offsetY + scaledDepth + (i * supportSpacing * scale);
      const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * scaledDepth) : 0;
      const supportY = baseY + additionalOffset;
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

    // Draw additional horizontal supports based on supportSpacing
    const additionalHorizontals = height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0;
    for (let i = 1; i <= additionalHorizontals; i++) {
      const baseY = offsetY + scaledDepth + (i * supportSpacing * scale);
      const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
      const supportY = baseY + additionalOffset;
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
      
      const prevSupportY = offsetY + scaledDepth;
      for (let i = 1; i <= additionalHorizontals; i++) {
        const baseY = offsetY + scaledDepth + (i * supportSpacing * scale);
        const additionalOffset = (coveringMaterial === "plywood" && width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
        const currentSupportY = baseY + additionalOffset;
        const arrowX = offsetX + scaledWidth + 30;
        const prevBaseY = offsetY + scaledDepth + ((i - 1) * supportSpacing * scale);
        const prevAdditionalOffset = (coveringMaterial === "plywood" && width > 1220 && (i - 1) > 1) ? ((i - 1) * slatDepth * scale) : 0;
        const startY = i === 1 ? prevSupportY : prevBaseY + prevAdditionalOffset;
        
        // Draw vertical line
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX, currentSupportY);
        ctx.stroke();
        
        // Draw arrows
        const arrowSize = 8;
        ctx.setLineDash([]);
        ctx.fillStyle = "hsl(199, 89%, 48%)";
        
        // Top arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, startY);
        ctx.lineTo(arrowX - arrowSize / 2, startY + arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, startY + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Bottom arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, currentSupportY);
        ctx.lineTo(arrowX - arrowSize / 2, currentSupportY - arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, currentSupportY - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        ctx.setLineDash([5, 5]);
        
        // Draw dimension text
        ctx.fillStyle = "hsl(0, 0%, 100%)";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.shadowBlur = 15;
        
        ctx.save();
        ctx.translate(arrowX + 25, (startY + currentSupportY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${supportSpacing/10}cm`, 0, 0);
        ctx.restore();
      }
      
      // Draw dimension arrow for the last segment (from last support to bottom)
      if (additionalHorizontals > 0) {
        const lastBaseY = offsetY + scaledDepth + (additionalHorizontals * supportSpacing * scale);
        const lastAdditionalOffset = (coveringMaterial === "plywood" && width > 1220 && additionalHorizontals > 1) ? (additionalHorizontals * slatDepth * scale) : 0;
        const lastSupportY = lastBaseY + lastAdditionalOffset;
        const bottomY = offsetY + scaledHeight - scaledDepth;
        const lastSegmentDistance = height - scaledDepth / scale - (additionalHorizontals * supportSpacing) - slatDepth;
        const arrowX = offsetX + scaledWidth + 30;
        
        // Draw vertical line
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(arrowX, lastSupportY);
        ctx.lineTo(arrowX, bottomY);
        ctx.stroke();
        
        // Draw arrows
        const arrowSize = 8;
        ctx.setLineDash([]);
        ctx.fillStyle = "hsl(199, 89%, 48%)";
        
        // Top arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, lastSupportY);
        ctx.lineTo(arrowX - arrowSize / 2, lastSupportY + arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, lastSupportY + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Bottom arrow
        ctx.beginPath();
        ctx.moveTo(arrowX, bottomY);
        ctx.lineTo(arrowX - arrowSize / 2, bottomY - arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, bottomY - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Draw dimension text
        ctx.fillStyle = "hsl(0, 0%, 100%)";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.shadowBlur = 15;
        
        ctx.save();
        ctx.translate(arrowX + 25, (lastSupportY + bottomY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${(Math.round(lastSegmentDistance)/10).toFixed(1)}cm`, 0, 0);
        ctx.restore();
      }
    }
    
    ctx.setLineDash([]);

    // Draw plywood covering on top of frame with random semi-transparent colors
    if (showCovering && coveringMaterial === "plywood") {
      ctx.shadowBlur = 0;
      
      // Frame boundaries
      const frameTop = offsetY + scaledDepth;
      const frameBottom = offsetY + scaledHeight - scaledDepth;
      const frameLeft = offsetX + scaledDepth;
      const frameRight = offsetX + scaledWidth - scaledDepth;
      
      // Draw plywood panels between horizontal supports
      for (let i = 0; i <= additionalHorizontals; i++) {
        // Generate random color for each panel
        const hue = Math.floor(Math.random() * 360);
        const saturation = Math.floor(Math.random() * 30) + 20; // 20-50%
        const lightness = Math.floor(Math.random() * 30) + 40; // 40-70%
        
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.9)`;
        
        // Calculate panel position
        let panelY, panelHeight;
        
        if (i === 0) {
          // First panel (frame top to first support)
          panelY = frameTop;
          const firstSupportY = frameTop + (supportSpacing * scale);
          panelHeight = supportSpacing * scale;
        } else {
          // Calculate previous support position
          const prevBaseY = offsetY + scaledDepth + ((i - 1) * supportSpacing * scale);
          const prevAdditionalOffset = (width > 1220 && (i - 1) > 1) ? ((i - 1) * slatDepth * scale) : 0;
          panelY = prevBaseY + prevAdditionalOffset + scaledDepth;
          
          if (i === additionalHorizontals) {
            // Last panel (last support to frame bottom)
            panelHeight = frameBottom - panelY;
          } else {
            // Middle panels (between supports)
            const currentBaseY = offsetY + scaledDepth + (i * supportSpacing * scale);
            const currentAdditionalOffset = (width > 1220 && i > 1) ? (i * slatDepth * scale) : 0;
            panelHeight = (currentBaseY + currentAdditionalOffset) - panelY;
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
    <div className="min-h-screen bg-background bg-blueprint-grid bg-grid p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-foreground mb-2 tracking-wider" style={{ textShadow: "var(--glow)" }}>
          WOODEN BLIND GENERATOR
        </h1>
        <p className="text-muted-foreground mb-8 font-mono uppercase tracking-wide text-sm">
          Technical Drawing System v1.0
        </p>

        <div className="grid lg:grid-cols-[300px_1fr_400px] gap-8">
          {/* Left Panel - Frame Covering & Support Spacing */}
          <div className="space-y-6">
            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                FRAME COVERING
              </h2>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="coveringMaterial" className="text-sm font-mono uppercase tracking-wider">
                    Material
                  </Label>
                  <Select value={coveringMaterial} onValueChange={setCoveringMaterial}>
                    <SelectTrigger id="coveringMaterial" className="w-full">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent className="bg-card z-50">
                      <SelectItem value="fabric">Fabric</SelectItem>
                      <SelectItem value="plywood">Plywood</SelectItem>
                    </SelectContent>
                  </Select>
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
                    Show covering
                  </Label>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border shadow-lg opacity-50 pointer-events-none" style={coveringMaterial === "plywood" ? {} : { opacity: 1, pointerEvents: 'auto' }}>
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                SUPPORT SPACING
              </h2>

              <div className="space-y-6">
                {/* Support Spacing Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="supportSpacing" className="text-sm font-mono uppercase tracking-wider">
                      Spacing (cm)
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
              </div>
            </Card>
          </div>

          {/* Canvas */}
          <Card className="p-6 border-border shadow-lg bg-transparent">
            <h2 className="text-xl font-semibold mb-4 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
              PREVIEW
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
                  Show horizontal spacers
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
            <div className="mt-4 space-y-4">
              <div className="text-sm text-muted-foreground font-mono">
                <div className="flex justify-between">
                  <span>SCALE: AUTO</span>
                  <span>AREA: {((width * height) / 1000000).toFixed(2)}m²</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="text-sm font-mono uppercase tracking-wider text-foreground">Cut Lists</h3>
                
                {/* Board Cut List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Board Cut List</h4>
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
                        <tr className="border-b border-border">
                          <td className="px-4 py-2 text-foreground">{(height - 2 * slatDepth)/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatWidth/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatDepth/10}</td>
                          <td className="px-4 py-2 text-foreground">2</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-foreground">{(width - 2 * slatDepth)/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatWidth/10}</td>
                          <td className="px-4 py-2 text-foreground">{slatDepth/10}</td>
                          <td className="px-4 py-2 text-foreground">{2 + (height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Plywood Cut List */}
                {coveringMaterial === "plywood" && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Plywood Cut List</h4>
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
                            <td className="px-4 py-2 text-foreground">{width/10}</td>
                            <td className="px-4 py-2 text-foreground">{(supportSpacing - slatDepth)/10}</td>
                            <td className="px-4 py-2 text-foreground">{plywoodThickness/10}</td>
                            <td className="px-4 py-2 text-foreground">{1 + (height > supportSpacing ? Math.floor((height - 2 * slatDepth) / supportSpacing) : 0)}</td>
                          </tr>
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
                            <td className="px-4 py-2 text-foreground">{(supportSpacing - slatDepth)/10}</td>
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
                FRAME DIMENSIONS
              </h2>

              <div className="space-y-6">
                {/* Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="width" className="text-sm font-mono uppercase tracking-wider">
                      Width (cm)
                    </Label>
                    <Input
                      id="width"
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={500}
                      max={1600}
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
                      Height (cm)
                    </Label>
                    <Input
                      id="height"
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={100}
                      max={4000}
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
                BOARD DIMENSIONS
              </h2>

              <div className="space-y-6">
                {/* Slat Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatWidth" className="text-sm font-mono uppercase tracking-wider">
                      Board Height (cm)
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
                      Board Depth (cm)
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
                    <span>1.6cm</span>
                    <span>2.5cm</span>
                  </div>
                </div>
              </div>
            </Card>

            {coveringMaterial === "plywood" && (
              <Card className="p-6 bg-card border-border shadow-lg">
                <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                  PLYWOOD DIMENSIONS
                </h2>

                <div className="space-y-6">
                  {/* Plywood Thickness Control */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="plywoodThickness" className="text-sm font-mono uppercase tracking-wider">
                        Thickness (mm)
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
