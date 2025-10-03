import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BlindGenerator = () => {
  const [width, setWidth] = useState(100); // mm
  const [height, setHeight] = useState(2000); // mm
  const [slatWidth, setSlatWidth] = useState(25); // mm board width
  const [slatDepth, setSlatDepth] = useState(20); // mm board depth
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SLAT_GAP = 3; // mm gap between slats

  useEffect(() => {
    drawBlinds();
  }, [width, height, slatWidth, slatDepth]);

  const downloadCutList = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Cut List - Wooden Blind", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Frame: ${width}mm × ${height}mm`, 14, 30);
    doc.text(`Board Depth: ${slatDepth}mm`, 14, 37);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 44);
    
    // Vertical boards - rotate so longer side is width
    const verticalWidth = height - 2 * slatDepth;
    const verticalHeight = slatWidth;
    
    // Horizontal boards - rotate so longer side is width
    const horizontalWidth = width - 2 * slatDepth;
    const horizontalHeight = slatWidth;
    
    // Calculate additional horizontal boards needed (every 610mm)
    const additionalHorizontals = height > 610 ? Math.floor((height - 2 * slatDepth) / 610) : 0;
    
    const tableData = [
      [verticalWidth, verticalHeight, slatDepth, 2],
      [horizontalWidth, horizontalHeight, slatDepth, 2 + additionalHorizontals],
    ];
    
    autoTable(doc, {
      startY: 50,
      head: [["Width (mm)", "Height (mm)", "Depth (mm)", "Quantity"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185] },
    });
    
    doc.save(`cutlist-${width}x${height}.pdf`);
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
    const offsetY = (canvas.height - scaledHeight) / 2;

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

    // Draw additional horizontal supports (every 610mm)
    const additionalHorizontals = height > 610 ? Math.floor((height - 2 * slatDepth) / 610) : 0;
    for (let i = 1; i <= additionalHorizontals; i++) {
      const supportY = offsetY + scaledDepth + (i * 610 * scale);
      const supportGradient = ctx.createLinearGradient(offsetX, supportY, offsetX, supportY + scaledDepth);
      supportGradient.addColorStop(0, "hsl(199, 85%, 50%)");
      supportGradient.addColorStop(1, "hsl(199, 75%, 40%)");
      ctx.fillStyle = supportGradient;
      ctx.fillRect(offsetX + scaledDepth, supportY, scaledWidth - 2 * scaledDepth, scaledDepth);
      ctx.strokeStyle = "hsl(199, 89%, 48%)";
      ctx.strokeRect(offsetX + scaledDepth, supportY, scaledWidth - 2 * scaledDepth, scaledDepth);
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
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.shadowBlur = 15;
    ctx.fillText(`${width}mm`, offsetX + scaledWidth / 2, offsetY - 25);
    
    ctx.save();
    ctx.translate(offsetX - 30, offsetY + scaledHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${height}mm`, 0, 0);
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

        <div className="grid lg:grid-cols-[1fr_400px] gap-8">
          {/* Canvas */}
          <Card className="p-6 border-border shadow-lg bg-transparent">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="w-full h-auto border border-border rounded bg-transparent"
            />
            <div className="mt-4 space-y-4">
              <div className="text-sm text-muted-foreground font-mono">
                <div className="flex justify-between">
                  <span>SLATS: {Math.floor(height / (slatWidth + SLAT_GAP))}</span>
                  <span>SCALE: AUTO</span>
                  <span>AREA: {((width * height) / 1000000).toFixed(2)}m²</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono uppercase tracking-wider text-foreground">Board Dimensions</h3>
                  <Button onClick={downloadCutList} size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    Download CutList
                  </Button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="bg-primary/10 border-b border-border">
                        <th className="px-4 py-2 text-left text-foreground">Width (mm)</th>
                        <th className="px-4 py-2 text-left text-foreground">Height (mm)</th>
                        <th className="px-4 py-2 text-left text-foreground">Depth (mm)</th>
                        <th className="px-4 py-2 text-left text-foreground">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="px-4 py-2 text-foreground">{height - 2 * slatDepth}</td>
                        <td className="px-4 py-2 text-foreground">{slatWidth}</td>
                        <td className="px-4 py-2 text-foreground">{slatDepth}</td>
                        <td className="px-4 py-2 text-foreground">2</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-foreground">{width - 2 * slatDepth}</td>
                        <td className="px-4 py-2 text-foreground">{slatWidth}</td>
                        <td className="px-4 py-2 text-foreground">{slatDepth}</td>
                        <td className="px-4 py-2 text-foreground">{2 + (height > 610 ? Math.floor((height - 2 * slatDepth) / 610) : 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>

          {/* Controls */}
          <div className="space-y-6">
            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                DIMENSIONS
              </h2>

              <div className="space-y-6">
                {/* Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="width" className="text-sm font-mono uppercase tracking-wider">
                      Width (mm)
                    </Label>
                    <Input
                      id="width"
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={50}
                      max={1600}
                    />
                  </div>
                  <Slider
                    value={[width]}
                    onValueChange={(value) => setWidth(value[0])}
                    min={50}
                    max={1600}
                    step={10}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>50mm</span>
                    <span>1600mm</span>
                  </div>
                </div>

                {/* Height Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="height" className="text-sm font-mono uppercase tracking-wider">
                      Height (mm)
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
                    <span>100mm</span>
                    <span>4000mm</span>
                  </div>
                </div>

                {/* Slat Depth Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatDepth" className="text-sm font-mono uppercase tracking-wider">
                      Board Depth (mm)
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

            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-6 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                BOARD HEIGHT
              </h2>

              <div className="space-y-6">
                {/* Slat Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatWidth" className="text-sm font-mono uppercase tracking-wider">
                      Board Height (mm)
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
                    <span>20mm</span>
                    <span>100mm</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card border-border shadow-lg">
              <h2 className="text-xl font-semibold mb-4 text-foreground tracking-wide" style={{ textShadow: "var(--glow)" }}>
                SPECIFICATIONS
              </h2>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Frame Width:</span>
                  <span className="text-foreground">{width}mm</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Frame Height:</span>
                  <span className="text-foreground">{height}mm</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Board Height:</span>
                  <span className="text-foreground">{slatWidth}mm</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Board Depth:</span>
                  <span className="text-foreground">{slatDepth}mm</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Slat Gap:</span>
                  <span className="text-foreground">3mm</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Total Slats:</span>
                  <span className="text-foreground">{Math.floor(height / (slatWidth + SLAT_GAP))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Material:</span>
                  <span className="text-foreground">Wood</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlindGenerator;
