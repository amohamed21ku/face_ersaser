"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as faceapi from 'face-api.js';
import { motion } from "framer-motion";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD0eyX6bAMBNt5fd1ZDOYW7G903AYosZk4",
  authDomain: "face-veil.firebaseapp.com",
  projectId: "face-veil",
  storageBucket: "face-veil.firebasestorage.app",
  messagingSenderId: "834940908059",
  appId: "1:834940908059:web:f9e375e78afb76bda53ebe"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);

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

  const mergePoints = (a: faceapi.Point[], b: faceapi.Point[]) => [...a, ...b.reverse()];
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
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [skinColor, setSkinColor] = useState<string>(skinToneGrey);
  const router = useRouter();

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

  const handleShare = async () => {
    if (!maskedImage) return;
    
    setIsSharing(true);
    try {
      // Convert data URL to blob
      const response = await fetch(maskedImage);
      const blob = await response.blob();
      
      // Create a unique filename
      const filename = `masked_${Date.now()}.png`;
      const storageRef = ref(storage, `images/${filename}`);
      
      // Upload to Firebase Storage
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      // Add to Firestore
      await addDoc(collection(db, "images"), {
        image_url: downloadURL,
        created_at: serverTimestamp()
      });
      
      toast.success("Image shared successfully!");
      router.push("/gallery");
    } catch (error) {
      console.error("Error sharing image:", error);
      toast.error("Failed to share image");
    } finally {
      setIsSharing(false);
    }
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
    <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-8 bg-gradient-to-b from-black to-zinc-900 text-white overflow-hidden">
      {/* Header section with logo and course code */}
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center p-6 z-50">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1 }}
          className="flex items-center"
        >
          <img
            src="/koc-logo.png"
            alt="Koç University Logo"
            className="h-16 md:h-20 w-auto"
          />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1 }}
          className="bg-red-900/20 px-6 py-2 rounded-lg border border-red-900/30"
        >
          <h2 className="text-2xl md:text-3xl font-bold tracking-wider text-white">ASIU 104</h2>
        </motion.div>
      </div>

      {/* Main content */}
      <div className="mt-24 md:mt-32 max-w-4xl w-full flex flex-col items-center">
        <motion.h1
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
          className="text-4xl md:text-6xl font-bold text-red-800 tracking-widest uppercase mb-6 text-center z-10"
        >
          EVERYTHING WILL BE TAKEN AWAY
        </motion.h1>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="w-16 h-1 bg-red-700 mb-6"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="text-center text-sm md:text-base max-w-xl text-gray-300 italic mb-8 z-10"
        >
          "The transformation of silence into language and action is an act of self-revelation."
        </motion.p>

        <Card className="w-full max-w-2xl bg-zinc-900/90 text-white shadow-2xl border border-red-900/50 backdrop-blur z-10 overflow-hidden">
          <CardHeader className="flex flex-col items-center space-y-2 border-b border-zinc-800">
            <CardTitle className="text-2xl font-semibold tracking-tight">Piper's Effect</CardTitle>
            <CardDescription className="text-sm text-gray-400">
              
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6 p-6">
            <div className="relative w-full">
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-sm bg-zinc-800 border-zinc-700 focus:border-red-700 transition-all"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-900/10 to-transparent opacity-30 pointer-events-none"></div>
            </div>
            
            <div className="w-full flex items-center justify-center relative min-h-64 border border-dashed border-zinc-700 rounded-lg p-4">
              {image ? (
                isLoading ? (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-400">Processing your image...</p>
                  </div>
                ) : maskedImage ? (
                  <div className="relative">
                    <img 
                      src={maskedImage} 
                      alt="Monochrome Masked Face" 
                      className="border border-zinc-800 rounded-md shadow-lg max-h-96 object-contain" 
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1,
                        pointerEvents: 'none'
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-red-500 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Face detection failed. Please try another image.
                  </div>
                )
              ) : (
                <div className="text-gray-500 flex flex-col items-center justify-center space-y-2">
                  <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <p>Upload an image containing a face</p>
                </div>
              )}
            </div>

                <div className="flex gap-2 w-full">
              <Button 
                onClick={handleDownload} 
                disabled={!maskedImage} 
                className="bg-red-800 text-white hover:bg-red-900 transition-all disabled:bg-zinc-800 disabled:text-zinc-500 flex-1"
              >
                {maskedImage ? "Download Masked Image" : "Waiting for image..."}
              </Button>
              <Button 
                onClick={handleShare} 
                disabled={!maskedImage || isSharing}
                className="bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:bg-zinc-800 disabled:text-zinc-500 flex-1"
              >
                {isSharing ? "Sharing..." : "Share"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ambient quotes */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 text-sm text-gray-600 opacity-30 text-center max-w-xs mx-auto"
      >
        "Pretend things are different."
      </motion.div>

      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-40 right-10 text-sm text-gray-500 opacity-20 rotate-3"
      >
        "The future is here now, but it's not evenly distributed."
      </motion.div>
      
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          transition={{ duration: 2 }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/10 via-transparent to-transparent"
        />
        
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full border border-red-900/10 opacity-20"
        />
      </div>
    </div>
  );
}
