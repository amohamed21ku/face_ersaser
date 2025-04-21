"use client";

import { useEffect, useState } from "react";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { getFirestore, collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function GalleryPage() {
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const q = query(collection(getFirestore(), "images"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const urls: string[] = [];
      querySnapshot.forEach((doc) => {
        urls.push(doc.data().image_url);
      });
      setImages(urls);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Community Gallery</h1>
          <Button 
            onClick={() => router.push("/")}
            className="bg-red-800 hover:bg-red-900"
          >
            Create Your Own
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            No images shared yet. Be the first!
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((url, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="overflow-hidden rounded-lg shadow-lg hover:shadow-red-900/50 transition-shadow"
              >
                <img
                  src={url}
                  alt={`Shared image ${index}`}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}