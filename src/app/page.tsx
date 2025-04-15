"use client";

import React, { useState, useRef, useEffect } from "react";
import * as faceapi from 'face-api.js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Eraser } from "lucide-react";

export async function loadModels() {
  const MODEL_URL = '/models'
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
}

function sampleSkinColor(ctx: CanvasRenderingContext2D, x: number, y: number): string {
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}
function getFullFaceContour(landmarks: faceapi.FaceLandmarks68): faceapi.Point[] {
  const jaw = landmarks.getJawOutline();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();

  // Estimate forehead curve from eyebrows
  const forehead = [
    ...leftBrow.map(p => ({ x: p.x, y: p.y - 50 })),
    ...rightBrow.slice().reverse().map(p => ({ x: p.x, y: p.y - 50 }))
  ];

  return [...jaw, ...forehead];
}

function paintFaceWithSkinColor(ctx: CanvasRenderingContext2D, contour: faceapi.Point[], fillColor: string) {
  const region = new Path2D();
  region.moveTo(contour[0].x, contour[0].y);
  contour.forEach(p => region.lineTo(p.x, p.y));
  region.closePath();

  ctx.save();
  ctx.clip(region);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

function eraseRegionSmart(ctx: CanvasRenderingContext2D, points: faceapi.Point[], scaleFactor: number) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();

  // Calculate the center of the region
  let centerX = 0;
  let centerY = 0;
  for (const point of points) {
    centerX += point.x;
    centerY += point.y;
  }
  centerX /= points.length;
  centerY /= points.length;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scaleFactor, scaleFactor);
  ctx.translate(-centerX, -centerY);

  ctx.clip();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export async function applyGreyFaceMask(image: HTMLImageElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  if (!detection) throw new Error('No face detected');

  const landmarks = detection.landmarks;

  // Sample a cheek point to get a skin color (cheek is around point index 3)
  const cheekPoint = landmarks.positions[3];
  const skinColor = sampleSkinColor(ctx, cheekPoint.x, cheekPoint.y);

  // Get the full face contour
  const faceContour = getFullFaceContour(landmarks);

  // Paint the full inside-face area with the sampled skin color
  paintFaceWithSkinColor(ctx, faceContour, skinColor);

  return canvas;
}


export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [maskedImage, setMaskedImage] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const load = async () => {
      await loadModels();
    }
    load();
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (selectedImage) {
      if (imageRef.current) {
        imageRef.current.onload = async () => {
          try {
            const maskedCanvas = await applyGreyFaceMask(imageRef.current as HTMLImageElement);
            setMaskedImage(maskedCanvas.toDataURL());
          } catch (error: any) {
            console.error("Error applying mask:", error);
            alert(error.message);
          }
        };
        imageRef.current.src = selectedImage;
      }
    }
  }, [selectedImage]);

  const handleDownload = () => {
    if (maskedImage && canvasRef.current) {
      const link = document.createElement("a");
      link.href = maskedImage;
      link.download = "masked_image.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Card className="w-full max-w-md space-y-4 p-4">
        <CardHeader>
          <CardTitle>Face Veil</CardTitle>
          <CardDescription>
            Upload an image to apply a grey face mask.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept="image/*" onChange={handleImageUpload} />
          {selectedImage && (
            <div className="flex justify-center">
              <img
                src={selectedImage}
                alt="Uploaded"
                style={{ maxWidth: '100%', maxHeight: '300px' }}
                ref={imageRef}
                className="hidden"
              />
            </div>
          )}
          {maskedImage && (
            <div className="flex justify-center">
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '300px' }} />
              <img
                src={maskedImage}
                alt="Masked"
                style={{ maxWidth: '100%', maxHeight: '300px' }}
              />
            </div>
          )}
          <Button onClick={handleDownload} disabled={!maskedImage} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Download Masked Image <Eraser className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
