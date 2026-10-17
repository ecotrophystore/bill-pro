import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onCropComplete: (croppedFile: File) => void;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onCropComplete
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: any
  ): Promise<File | null> => {
    const image = await createImage(imageSrc);

    // --- Step 1: Draw the full image onto an intermediate canvas ---
    // This normalises EXIF orientation (browsers auto-rotate <img> but not canvas),
    // which was causing phone-camera JPEGs to arrive rotated/flipped at the AI.
    const fullCanvas = document.createElement('canvas');
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) return null;

    fullCanvas.width = image.naturalWidth;
    fullCanvas.height = image.naturalHeight;
    fullCtx.drawImage(image, 0, 0);

    // --- Step 2: Extract just the cropped region ---
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return null;

    croppedCanvas.width = pixelCrop.width;
    croppedCanvas.height = pixelCrop.height;

    croppedCtx.drawImage(
      fullCanvas,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    // --- Step 3: Downscale if image is too large for the Gemini API inline limit ---
    // Large phone photos (e.g. 12MP) produce base64 payloads that exceed the limit,
    // causing the API to return an empty or failed response.
    const MAX_DIM = 2048;
    let outputCanvas = croppedCanvas;
    if (pixelCrop.width > MAX_DIM || pixelCrop.height > MAX_DIM) {
      const scale = Math.min(MAX_DIM / pixelCrop.width, MAX_DIM / pixelCrop.height);
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = Math.round(pixelCrop.width * scale);
      scaledCanvas.height = Math.round(pixelCrop.height * scale);
      const scaledCtx = scaledCanvas.getContext('2d');
      if (scaledCtx) {
        scaledCtx.drawImage(croppedCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        outputCanvas = scaledCanvas;
      }
    }

    return new Promise((resolve) => {
      outputCanvas.toBlob((file) => {
        if (file) {
          resolve(new File([file], 'cropped_image.jpeg', { type: 'image/jpeg' }));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.92);
    });
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedImage = await getCroppedImg(imageUrl, croppedAreaPixels);
      if (croppedImage) {
        onCropComplete(croppedImage);
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      alert("Error cropping image: " + (e.message || JSON.stringify(e)));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Crop Image</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="relative h-[400px] w-full bg-black">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Check size={18} />
            Confirm Crop
          </button>
        </div>
      </div>
    </div>
  );
};
