"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as faceapi from 'face-api.js';
import { motion } from "framer-motion";

export async function loadModels() {
  const MODEL_URL = '/models';
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
}

function eraseRegionSmart(ctx: CanvasRenderingContext2D, points: faceapi.Point[], scaleFactor: number = 1) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.closePath();
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();
  ctx.fill();

  ctx.restore();
}

export async function applyGreyFaceMask(image: HTMLImageElement): Promise<{ canvas: HTMLCanvasElement, skinColor: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);

  const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const originalData = originalImageData.data;

  const detection = await faceapi
    .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks();

  if (!detection) throw new Error('No face detected');

  const lm = detection.landmarks;

  const cheekPoints = [lm.positions[3], lm.positions[13]];
  let rSum = 0, gSum = 0, bSum = 0;
  for (const p of cheekPoints) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const idx = (y * canvas.width + x) * 4;
    rSum += originalData[idx];
    gSum += originalData[idx + 1];
    bSum += originalData[idx + 2];
  }
  const avgR = Math.round(rSum / cheekPoints.length);
  const avgG = Math.round(gSum / cheekPoints.length);
  const avgB = Math.round(bSum / cheekPoints.length);
  const skinColorString = `rgb(${avgR}, ${avgG}, ${avgB})`;

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

  const mergePoints = (a: faceapi.Point[], b: faceapi.Point[]) => {
    return [...a, ...b.reverse()];
  };

  const leftEyeRegion = mergePoints(lm.getLeftEye(), lm.getLeftEyeBrow());
  const rightEyeRegion = mergePoints(lm.getRightEye(), lm.getRightEyeBrow());

  eraseRegionSmart(ctx, leftEyeRegion, 1.5);
  eraseRegionSmart(ctx, rightEyeRegion, 1.5);
  eraseRegionSmart(ctx, lm.getNose(), 1.4);
  eraseRegionSmart(ctx, lm.getMouth(), 1.5);

  return { canvas, skinColor: skinColorString };
}

const skinToneGrey = "#D3D3D3";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [maskedImage, setMaskedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
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
            const overlayCtx = overlayCanvasRef.current.getContext('2d');
            if (overlayCtx) {
              overlayCanvasRef.current.width = canvas.width;
              overlayCanvasRef.current.height = canvas.height;
              drawOverlayText(overlayCanvasRef.current);
            }
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

  function drawOverlayText(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = "EVERYTHING WILL BE TAKEN AWAY";
    ctx.font = "bold 28px Arial";
    ctx.fillStyle = "darkred";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 40);
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-8 bg-black text-white overflow-hidden">
      <motion.h1
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        className="text-4xl md:text-5xl font-bold text-red-900 tracking-widest uppercase mb-4 text-center z-10"
      >
        EVERYTHING WILL BE TAKEN AWAY
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="text-center text-sm max-w-xl text-gray-300 italic mb-6 z-10"
      >
        “The transformation of silence into language and action is an act of self-revelation.”
      </motion.p>

      <Card className="w-full max-w-2xl bg-neutral-900 text-white shadow-2xl border border-red-900 z-10">
        <CardHeader className="flex flex-col items-center space-y-2">
          <CardTitle className="text-2xl font-semibold tracking-tight">Monochrome Mask</CardTitle>
          <CardDescription className="text-sm text-gray-400">
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

          <Button onClick={handleDownload} disabled={!maskedImage} className="bg-red-700 text-white hover:bg-red-800">
            Download Image
          </Button>
        </CardContent>
      </Card>

      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute bottom-12 text-sm text-gray-600 opacity-30 text-center max-w-xs mx-auto"
      >
        “Pretend things are different.”
      </motion.div>

      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 10, repeat: Infinity }}
        className="absolute top-20 right-20 text-sm text-gray-500 opacity-40"
      >
        "The future is here now, but it's not evenly distributed."
      </motion.div>
    </div>
  );
}
