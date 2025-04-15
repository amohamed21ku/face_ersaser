"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import * as faceapi from 'face-api.js';

export async function loadModels() {
  const MODEL_URL = '/models';
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
}

export async function applyGreyFaceMask(image: HTMLImageElement): Promise<{ canvas: HTMLCanvasElement, skinColor: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = data[i + 1] = data[i + 2] = avg;
  }
  ctx.putImageData(imageData, 0, 0);

  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  if (!detection) throw new Error('No face detected');

  const lm = detection.landmarks;

  const cheekPoints = [lm.positions[3], lm.positions[13]];
  let total = 0;
  for (const p of cheekPoints) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const idx = (y * canvas.width + x) * 4;
    total += data[idx];
  }
  const baseTone = Math.round(total / cheekPoints.length);
  const skinColorString = `rgb(${baseTone}, ${baseTone}, ${baseTone})`;

  const jaw = lm.getJawOutline();
  const leftBrow = lm.getLeftEyeBrow().map(p => ({ x: p.x, y: p.y - 60 }));
  const rightBrow = lm.getRightEyeBrow().map(p => ({ x: p.x, y: p.y - 60 }));
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
  const [bwImage, setBwImage] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState<number>(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [maskedImage, setMaskedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [drawing, setDrawing] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [skinColor, setSkinColor] = useState<string>(skinToneGrey);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        await loadModels();
      } catch (error) {
        console.error("Failed to load face-api models:", error);
        alert('Failed to load face detection models. Please check the console for details.');
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
            overlayCanvasRef.current.width = canvas.width;
            overlayCanvasRef.current.height = canvas.height;
            drawOverlayText(overlayCanvasRef.current);
          }
        } catch (error: any) {
          console.error("Face detection or masking failed:", error);
          alert(`Face detection or masking failed: ${error.message}`);
          setMaskedImage(null);
        } finally {
          setIsLoading(false);
        }
      };
      image.onerror = () => {
        console.error("Failed to load image");
        alert('Failed to load image.');
        setIsLoading(false);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (!maskedImage) {
      alert("No masked image available to download.");
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

    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    ctx.lineTo(x, y);
    ctx.stroke();
    setOverlayImage(canvas.toDataURL('image/png'));
  };

  const handleMouseUp = () => {
    setDrawing(false);
  };

  const handleMouseLeave = () => {
    setDrawing(false);
  };

  function drawOverlayText(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = "EVERYTHING WILL BE TAKEN AWAY";
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "darkred";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 40); // 40px from top
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground">
      <Card className="w-full max-w-2xl bg-card text-card-foreground shadow-md rounded-lg">
        <CardHeader className="flex flex-col items-center space-y-2">
          <CardTitle className="text-2xl font-semibold tracking-tight">Monochrome Mask</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Upload an image, convert it to black and white, and mask the facial features.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          <Input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="w-full text-sm"
          />
          <div className="w-full flex items-center justify-center relative">
            {image ? (
              isLoading ? (
                <div>Processing...</div>
              ) : maskedImage ? (
                <div style={{ position: 'relative' }}>
                  <img src={maskedImage} alt="Monochrome Masked Face" className="border border-border rounded-md shadow-sm" />
                  <canvas
                    ref={overlayCanvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      zIndex: 1,
                      pointerEvents: 'auto'
                    }}
                  />
                </div>
              ) : (
                <div>Face detection failed.</div>
              )
            ) : (
              <div>Please upload an image.</div>
            )}
          </div>

          <div className="w-full flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0 sm:space-x-4">
            <Button onClick={handleDownload} disabled={!maskedImage} className="bg-teal-500 text-teal-50 hover:bg-teal-700">
              Download Image
            </Button>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
