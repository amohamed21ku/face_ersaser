import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

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

// Get Firebase services
export const storage = getStorage(app);
export const db = getFirestore(app);
