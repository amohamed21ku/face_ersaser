"use client";

import React, { useState, useRef, useEffect } from "react";
import * as faceapi from 'face-api.js';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    const contour = getFullFaceContour(landmarks);

    // Sample skin color from cheek
    const cheekPoint = landmarks.positions[3] || { x: canvas.width / 2, y: canvas.height / 2 };
    const skinColor = sampleSkinColor(ctx, cheekPoint.x, cheekPoint.y);

    // Fill face with sampled skin color
    paintFaceWithSkinColor(ctx, contour, skinColor);

    // Draw gray rectangle over eyes, nose, mouth, and forehead
    const box = detection.detection.box;
    ctx.fillStyle = 'rgba(128, 128, 128, 0.8)'; // Grey with 80% opacity
    ctx.fillRect(box.x, box.y, box.width, box.height * 0.7);

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
          <Button onClick={handleDownload} disabled={!maskedImage} style={{backgroundColor: '#008080', color: 'white'}}>
            Download Masked Image
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
