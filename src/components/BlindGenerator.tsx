import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

const BlindGenerator = () => {
  const [width, setWidth] = useState(100); // mm
  const [height, setHeight] = useState(2000); // mm
  const [slatWidth, setSlatWidth] = useState(25); // mm board width
  const [slatDepth, setSlatDepth] = useState(3); // mm board depth
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const SLAT_GAP = 3; // mm gap between slats

  useEffect(() => {
    drawBlinds();
  }, [width, height, slatWidth, slatDepth]);

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

    // Draw frame (outline only)
    ctx.strokeStyle = "hsl(199, 89%, 48%)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "hsl(199, 89%, 48%)";
    ctx.shadowBlur = 15;
    ctx.strokeRect(offsetX, offsetY, scaledWidth, scaledHeight);

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

    // Calculate number of slats
    const numSlats = Math.floor(height / (slatWidth + SLAT_GAP));
    const scaledSlatHeight = slatWidth * scale;
    const scaledSlatGap = SLAT_GAP * scale;

    ctx.shadowBlur = 0;

    // Draw slats
    for (let i = 0; i < numSlats; i++) {
      const y = offsetY + i * (scaledSlatHeight + scaledSlatGap);

      // Wood gradient
      const gradient = ctx.createLinearGradient(offsetX, y, offsetX, y + scaledSlatHeight);
      gradient.addColorStop(0, "hsl(30, 45%, 45%)");
      gradient.addColorStop(0.3, "hsl(30, 40%, 35%)");
      gradient.addColorStop(0.7, "hsl(30, 40%, 35%)");
      gradient.addColorStop(1, "hsl(30, 35%, 25%)");

      ctx.fillStyle = gradient;
      ctx.fillRect(offsetX, y, scaledWidth, scaledSlatHeight);

      // Wood grain texture
      ctx.strokeStyle = "hsl(30, 30%, 30%)";
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(offsetX, y + (j + 1) * (scaledSlatHeight / 4));
        ctx.lineTo(offsetX + scaledWidth, y + (j + 1) * (scaledSlatHeight / 4));
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1;

      // Slat border
      ctx.strokeStyle = "hsl(30, 30%, 20%)";
      ctx.lineWidth = 1;
      ctx.strokeRect(offsetX, y, scaledWidth, scaledSlatHeight);
    }
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
            <div className="mt-4 text-sm text-muted-foreground font-mono">
              <div className="flex justify-between">
                <span>SLATS: {Math.floor(height / (slatWidth + SLAT_GAP))}</span>
                <span>SCALE: AUTO</span>
                <span>AREA: {((width * height) / 1000000).toFixed(2)}m²</span>
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

                {/* Slat Width Control */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="slatWidth" className="text-sm font-mono uppercase tracking-wider">
                      Board Width (mm)
                    </Label>
                    <Input
                      id="slatWidth"
                      type="number"
                      value={slatWidth}
                      onChange={(e) => setSlatWidth(Number(e.target.value))}
                      className="w-24 h-9 text-center font-mono bg-secondary border-primary/30 text-foreground focus:border-primary focus:ring-primary"
                      min={10}
                      max={100}
                    />
                  </div>
                  <Slider
                    value={[slatWidth]}
                    onValueChange={(value) => setSlatWidth(value[0])}
                    min={10}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>10mm</span>
                    <span>100mm</span>
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
                      min={1}
                      max={20}
                    />
                  </div>
                  <Slider
                    value={[slatDepth]}
                    onValueChange={(value) => setSlatDepth(value[0])}
                    min={1}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-mono">
                    <span>1mm</span>
                    <span>20mm</span>
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
                  <span className="text-muted-foreground">Board Width:</span>
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
