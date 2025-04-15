"use client";

import React, { useState, useRef, useEffect } from "react";
import * as faceapi from 'face-api.js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Eraser } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export async function loadModels() {
  const MODEL_URL = '/models';
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
}

function sampleSkinColor(ctx: CanvasRenderingContext2D, x: number, y: number): string {
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}

function getFullFaceContour(landmarks: faceapi.FaceLandmarks68): faceapi.Point[] {
  const jaw = landmarks.getJawOutline();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();
  const leftForehead = leftBrow.map(p => ({ x: p.x, y: p.y - 50 }));
  const rightForehead = rightBrow.map(p => ({ x: p.x, y: p.y - 50 }));
  const topContour = [...leftForehead, ...rightForehead.reverse()];
  const fullContour = [...jaw, ...topContour.reverse()];
  return fullContour;
}

function paintFaceWithSkinColor(ctx: CanvasRenderingContext2D, contour: faceapi.Point[], fillColor: string) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(contour[0].x, contour[0].y);
  contour.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

export async function applyGreyFaceMask(image: HTMLImageElement): Promise<{ canvas: HTMLCanvasElement; skinColor: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;        // red
    data[i + 1] = avg;    // green
    data[i + 2] = avg;    // blue
  }

  ctx.putImageData(imageData, 0, 0);

  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  if (!detection) throw new Error('No face detected');

  const landmarks = detection.landmarks;

  const cheekPoints = [landmarks.positions[3], landmarks.positions[13]];
  let total = 0;
  for (const p of cheekPoints) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const idx = (y * canvas.width + x) * 4;
    total += data[idx];
  }
  const baseTone = Math.round(total / cheekPoints.length);
  const skinColorString = `rgb(${baseTone}, ${baseTone}, ${baseTone})`;

  const jaw = landmarks.getJawOutline();
  const leftBrow = landmarks.getLeftEyeBrow().map(p => ({ x: p.x, y: p.y - 60 }));
  const rightBrow = landmarks.getRightEyeBrow().map(p => ({ x: p.x, y: p.y - 60 }));
  const faceRegion = [...leftBrow, ...rightBrow.reverse(), ...jaw.reverse()];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(faceRegion[0].x, faceRegion[0].y);
  faceRegion.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = skinColorString;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  return { canvas, skinColor: skinColorString };
}

const skinToneGrey = "#D3D3D3";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [maskedImage, setMaskedImage] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState<number>(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [drawing, setDrawing] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [skinColor, setSkinColor] = useState<string>(skinToneGrey);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        await loadModels();
      } catch (error) {
        console.error("Failed to load face-api models:", error);
        toast({
          title: "Error",
          description: 'Failed to load face detection models. Please check the console for details.',
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imgDataUrl = reader.result as string;
      setImage(imgDataUrl);

      const image = new Image();
      image.src = imgDataUrl;
      image.onload = async () => {
        setIsLoading(true);
        try {
          const { canvas, skinColor } = await applyGreyFaceMask(image);
          setMaskedImage(canvas.toDataURL('image/png'));
          setSkinColor(skinColor);

          if (overlayCanvasRef.current) {
            const overlayCtx = overlayCanvasRef.current.getContext('2d');
            if (overlayCtx) {
              overlayCanvasRef.current.width = canvas.width;
              overlayCanvasRef.current.height = canvas.height;
              overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        } catch (error: any) {
          console.error("Face detection or masking failed:", error);
          toast({
            title: "Error",
            description: `Face detection or masking failed: ${error.message}`,
            variant: "destructive",
          });
          setMaskedImage(null);
        } finally {
          setIsLoading(false);
        }
      };
      image.onerror = () => {
        console.error("Failed to load image");
        toast({
          title: "Error",
          description: 'Failed to load image.',
          variant: "destructive",
        });
        setIsLoading(false);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (!maskedImage) {
      toast({
        title: "Warning",
        description: "No masked image available to download.",
      });
      return;
    }

    const a = document.createElement('a');
    a.href = maskedImage;
    a.download = 'masked_face.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = skinColor;

    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const handleMouseUp = () => {
    setDrawing(false);
  };

  const handleMouseLeave = () => {
    setDrawing(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md space-y-4">
        <CardHeader>
          <CardTitle>Face Veil</CardTitle>
          <CardDescription>
            Upload an image to apply a monochrome face mask and customize it with a brush.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="image/*" onChange={handleImageUpload} />

          {image && (
            <div className="relative flex justify-center">
              {isLoading ? (
                <div className="text-muted-foreground">Processing...</div>
              ) : maskedImage ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={maskedImage}
                    alt="Monochrome Masked Face"
                    className="rounded-md border"
                    style={{ maxWidth: '100%', maxHeight: '300px' }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    width={imageRef.current?.width || 0}
                    height={imageRef.current?.height || 0}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      pointerEvents: 'auto',
                      maxWidth: '100%',
                      maxHeight: '300px',
                      imageRendering: 'pixelated',
                    }}
                    className="rounded-md"
                  />
                </div>
              ) : (
                <div className="text-muted-foreground">Face detection failed.</div>
              )}
            </div>
          )}

          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <label htmlFor="brushSize" className="text-sm font-medium">Brush Size:</label>
              <Slider
                id="brushSize"
                min={1}
                max={50}
                step={1}
                defaultValue={[brushSize]}
                onValueChange={(value) => setBrushSize(value[0])}
                className="w-24"
              />
              <span className="text-sm">{brushSize}</span>
            </div>
            <Button onClick={handleDownload} disabled={!maskedImage} className="bg-accent text-accent-foreground hover:bg-accent/80">
              Download Image <Eraser className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
