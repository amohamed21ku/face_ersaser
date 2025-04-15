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
  const jaw = landmarks.getJawOutline(); // bottom of the face
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();

  // Estimate the forehead by extending upwards from the brows
  const leftForehead = leftBrow.map(p => ({ x: p.x, y: p.y - 50 }));
  const rightForehead = rightBrow.map(p => ({ x: p.x, y: p.y - 50 }));

  const topContour = [...leftForehead, ...rightForehead.reverse()];
  const fullContour = [...jaw, ...topContour.reverse()]; // ensure a proper closed loop

  return fullContour;
}
function paintFaceWithSkinColor(ctx: CanvasRenderingContext2D, contour: faceapi.Point[], fillColor: string) {
  const region = new Path2D();
  region.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i++) {
    region.lineTo(contour[i].x, contour[i].y);
  }
  region.closePath();

  ctx.save();
  ctx.clip(region); // clip to the face region
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); // fill only within clip
  ctx.restore();
}
const skinToneGrey = 'rgb(200, 200, 200)'; // Light grey skin tone

export async function applyGreyFaceMask(image: HTMLImageElement): Promise<{ canvas: HTMLCanvasElement, skinColor: string }> {
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

  const cheekPoints = [
    landmarks.positions[3],  // Cheek
    landmarks.positions[43], // Outer corner of right eye
    landmarks.positions[46]   // Outer corner of left eye
  ];

  // Get average skin tone from multiple points
  let total = 0;
  for (const point of cheekPoints) {
    const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
    total += (pixel[0] + pixel[1] + pixel[2]) / 3; // Avg of R, G, B
  }

  // Sample skin tone from cheek (or fallback center)
  const baseTone = Math.round(total / cheekPoints.length);
  const skinColorString = `rgb(${baseTone}, ${baseTone}, ${baseTone})`;
ctx.strokeStyle = skinColor;

  const fullFaceContour = getFullFaceContour(landmarks);

  paintFaceWithSkinColor(ctx, fullFaceContour, skinColorString);
  ctx.fillStyle = skinColorString;


  return { canvas, skinColor: skinColorString };
}


export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [maskedImage, setMaskedImage] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [skinColor, setSkinColor] = useState<string>(skinToneGrey);


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
            const { canvas, skinColor } = await applyGreyFaceMask(imageRef.current as HTMLImageElement);
            setMaskedImage(canvas.toDataURL('image/png'));
            setSkinColor(skinColor); // <-- Save the sampled skin color
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
      link.body.removeChild(link);
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

