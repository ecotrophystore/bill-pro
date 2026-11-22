import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, Maximize2, Crop as CropIcon, Image as ImageIcon } from 'lucide-react';

export interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalFile?: File | null;
  onCropComplete: (croppedFile: File) => void;
  onSkipCrop?: (fullFile: File) => void;
}

interface CropRect {
  x: number;      // percentage (0 - 100)
  y: number;      // percentage (0 - 100)
  width: number;  // percentage (0 - 100)
  height: number; // percentage (0 - 100)
}

type DragHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move';

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  originalFile,
  onCropComplete,
  onSkipCrop
}) => {
  const [currentImageSrc, setCurrentImageSrc] = useState<string>(imageUrl);
  const [crop, setCrop] = useState<CropRect>({ x: 3, y: 3, width: 94, height: 94 });
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const imgWrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Track active pointer drag
  const dragRef = useRef<{
    handle: DragHandle;
    startX: number;
    startY: number;
    startCrop: CropRect;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  // Reset when imageUrl changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentImageSrc(imageUrl);
      setCrop({ x: 3, y: 3, width: 94, height: 94 });
      setRotationAngle(0);
      setIsProcessing(false);
    }
  }, [isOpen, imageUrl]);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  // Rotate image 90 degrees clockwise using Canvas
  const handleRotate90 = async () => {
    setIsProcessing(true);
    try {
      const image = await createImage(currentImageSrc);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCurrentImageSrc(rotatedDataUrl);
      setRotationAngle((prev) => (prev + 90) % 360);
      setCrop({ x: 3, y: 3, width: 94, height: 94 });
    } catch (err) {
      console.error('Failed to rotate image:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset crop box to full image
  const handleFitFull = () => {
    setCrop({ x: 0, y: 0, width: 100, height: 100 });
  };

  // Convert crop rect into an output File (with EXIF normalization & downscaling)
  const generateImageFile = async (
    imageSrc: string,
    cropRect: CropRect,
    fileName: string = 'bill_image.jpeg'
  ): Promise<File | null> => {
    const image = await createImage(imageSrc);
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    const pixelX = Math.max(0, Math.round((cropRect.x / 100) * naturalWidth));
    const pixelY = Math.max(0, Math.round((cropRect.y / 100) * naturalHeight));
    const pixelW = Math.min(naturalWidth - pixelX, Math.round((cropRect.width / 100) * naturalWidth));
    const pixelH = Math.min(naturalHeight - pixelY, Math.round((cropRect.height / 100) * naturalHeight));

    if (pixelW <= 0 || pixelH <= 0) return null;

    // Intermediate canvas
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = pixelW;
    croppedCanvas.height = pixelH;
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) return null;

    croppedCtx.drawImage(
      image,
      pixelX,
      pixelY,
      pixelW,
      pixelH,
      0,
      0,
      pixelW,
      pixelH
    );

    // Downscale if too large for Gemini API limit (max 2048px)
    const MAX_DIM = 2048;
    let outputCanvas = croppedCanvas;
    if (pixelW > MAX_DIM || pixelH > MAX_DIM) {
      const scale = Math.min(MAX_DIM / pixelW, MAX_DIM / pixelH);
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = Math.round(pixelW * scale);
      scaledCanvas.height = Math.round(pixelH * scale);
      const scaledCtx = scaledCanvas.getContext('2d');
      if (scaledCtx) {
        scaledCtx.drawImage(croppedCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        outputCanvas = scaledCanvas;
      }
    }

    return new Promise((resolve) => {
      outputCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], fileName, { type: 'image/jpeg' }));
          } else {
            resolve(null);
          }
        },
        'image/jpeg',
        0.92
      );
    });
  };

  // User confirms crop
  const handleConfirmCrop = async () => {
    setIsProcessing(true);
    try {
      const croppedFile = await generateImageFile(currentImageSrc, crop, 'cropped_bill.jpeg');
      if (croppedFile) {
        onCropComplete(croppedFile);
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      alert('Error cropping image: ' + (e.message || JSON.stringify(e)));
    } finally {
      setIsProcessing(false);
    }
  };

  // User cancels crop -> Take original image WITHOUT cropping, as requested!
  const handleCancelWithoutCrop = async () => {
    setIsProcessing(true);
    try {
      // If user rotated image, we export the rotated full image
      if (rotationAngle !== 0 || !originalFile) {
        const fullFile = await generateImageFile(
          currentImageSrc,
          { x: 0, y: 0, width: 100, height: 100 },
          'full_bill.jpeg'
        );
        if (fullFile) {
          if (onSkipCrop) {
            onSkipCrop(fullFile);
          } else {
            onCropComplete(fullFile);
          }
        } else if (originalFile) {
          if (onSkipCrop) onSkipCrop(originalFile);
          else onCropComplete(originalFile);
        }
      } else {
        // Use the original raw file directly
        if (onSkipCrop) {
          onSkipCrop(originalFile);
        } else {
          onCropComplete(originalFile);
        }
      }
      onClose();
    } catch (err) {
      console.error('Error proceeding without crop:', err);
      if (originalFile) {
        if (onSkipCrop) onSkipCrop(originalFile);
        else onCropComplete(originalFile);
      }
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  // Pointer drag handling for mobile touch & desktop mouse
  const handlePointerDown = (e: React.PointerEvent, handle: DragHandle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!imgWrapperRef.current) return;
    const rect = imgWrapperRef.current.getBoundingClientRect();

    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      containerWidth: rect.width,
      containerHeight: rect.height
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const { handle, startX, startY, startCrop, containerWidth, containerHeight } = dragRef.current;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const dx = ((e.clientX - startX) / containerWidth) * 100;
    const dy = ((e.clientY - startY) / containerHeight) * 100;
    const MIN_SIZE = 6; // minimum 6% width/height to avoid collapse

    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

    if (handle === 'move') {
      const maxX = 100 - startCrop.width;
      const maxY = 100 - startCrop.height;
      const newX = clamp(startCrop.x + dx, 0, maxX);
      const newY = clamp(startCrop.y + dy, 0, maxY);
      setCrop({
        ...startCrop,
        x: newX,
        y: newY
      });
      return;
    }

    if (handle === 'nw') {
      const fixedRight = startCrop.x + startCrop.width;
      const fixedBottom = startCrop.y + startCrop.height;
      const newX = clamp(startCrop.x + dx, 0, fixedRight - MIN_SIZE);
      const newY = clamp(startCrop.y + dy, 0, fixedBottom - MIN_SIZE);
      setCrop({
        x: newX,
        y: newY,
        width: fixedRight - newX,
        height: fixedBottom - newY
      });
    } else if (handle === 'ne') {
      const fixedLeft = startCrop.x;
      const fixedBottom = startCrop.y + startCrop.height;
      const newRight = clamp(fixedLeft + startCrop.width + dx, fixedLeft + MIN_SIZE, 100);
      const newY = clamp(startCrop.y + dy, 0, fixedBottom - MIN_SIZE);
      setCrop({
        x: fixedLeft,
        y: newY,
        width: newRight - fixedLeft,
        height: fixedBottom - newY
      });
    } else if (handle === 'sw') {
      const fixedRight = startCrop.x + startCrop.width;
      const fixedTop = startCrop.y;
      const newX = clamp(startCrop.x + dx, 0, fixedRight - MIN_SIZE);
      const newBottom = clamp(fixedTop + startCrop.height + dy, fixedTop + MIN_SIZE, 100);
      setCrop({
        x: newX,
        y: fixedTop,
        width: fixedRight - newX,
        height: newBottom - fixedTop
      });
    } else if (handle === 'se') {
      const fixedLeft = startCrop.x;
      const fixedTop = startCrop.y;
      const newRight = clamp(fixedLeft + startCrop.width + dx, fixedLeft + MIN_SIZE, 100);
      const newBottom = clamp(fixedTop + startCrop.height + dy, fixedTop + MIN_SIZE, 100);
      setCrop({
        x: fixedLeft,
        y: fixedTop,
        width: newRight - fixedLeft,
        height: newBottom - fixedTop
      });
    } else if (handle === 'n') {
      const fixedBottom = startCrop.y + startCrop.height;
      const newY = clamp(startCrop.y + dy, 0, fixedBottom - MIN_SIZE);
      setCrop({
        ...startCrop,
        y: newY,
        height: fixedBottom - newY
      });
    } else if (handle === 's') {
      const newHeight = clamp(startCrop.height + dy, MIN_SIZE, 100 - startCrop.y);
      setCrop({
        ...startCrop,
        height: newHeight
      });
    } else if (handle === 'w') {
      const fixedRight = startCrop.x + startCrop.width;
      const newX = clamp(startCrop.x + dx, 0, fixedRight - MIN_SIZE);
      setCrop({
        ...startCrop,
        x: newX,
        width: fixedRight - newX
      });
    } else if (handle === 'e') {
      const newWidth = clamp(startCrop.width + dx, MIN_SIZE, 100 - startCrop.x);
      setCrop({
        ...startCrop,
        width: newWidth
      });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }, [onPointerMove]);

  // Clean up global listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 md:p-6 animate-fade-in select-none">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-gray-200 dark:border-gray-800">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CropIcon size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                Crop Bill / Receipt
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  Corner Crop
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Drag the corner handles to crop, or choose Cancel to keep full image
              </p>
            </div>
          </div>

          {/* Quick Discard (X) button */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
            title="Discard image and close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Rotate & Reset */}
        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800/60 border-b border-gray-200/60 dark:border-gray-700/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRotate90}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg shadow-2xs border border-gray-200 dark:border-gray-600 transition-colors disabled:opacity-50"
              title="Rotate 90 degrees clockwise"
            >
              <RotateCw size={14} className={isProcessing ? 'animate-spin' : ''} />
              <span>Rotate 90°</span>
              {rotationAngle > 0 && <span className="text-[10px] opacity-70">({rotationAngle}°)</span>}
            </button>

            <button
              onClick={handleFitFull}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg shadow-2xs border border-gray-200 dark:border-gray-600 transition-colors disabled:opacity-50"
              title="Expand crop to full image"
            >
              <Maximize2 size={14} />
              <span>Full View</span>
            </button>
          </div>

          <span className="text-[11px] text-gray-400 hidden sm:inline">
            Tip: Grab corners ⌜ ⌝ to freely adjust
          </span>
        </div>

        {/* Interactive Cropper Viewport */}
        <div className="relative w-full h-[380px] sm:h-[430px] bg-gray-950 flex items-center justify-center p-3 overflow-hidden select-none touch-none">
          {/* Sized Image Container */}
          <div
            ref={imgWrapperRef}
            className="relative inline-block max-w-full max-h-full overflow-hidden shadow-xl rounded-sm"
            style={{ touchAction: 'none' }}
          >
            {/* Display Image */}
            <img
              ref={imgRef}
              src={currentImageSrc}
              alt="Bill to crop"
              className="max-h-[350px] sm:max-h-[400px] max-w-full object-contain pointer-events-none block select-none"
              draggable={false}
            />

            {/* Crop Overlay Box with Outer Darkness Shadow */}
            <div
              className="absolute border-2 border-white/90 cursor-move"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
                touchAction: 'none'
              }}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
            >
              {/* 3x3 Rule of Thirds Grid */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/30" />
                <div className="border-r border-b border-white/30" />
                <div className="border-b border-white/30" />
                <div className="border-r border-b border-white/30" />
                <div className="border-r border-b border-white/30" />
                <div className="border-b border-white/30" />
                <div className="border-r border-white/30" />
                <div className="border-r border-white/30" />
                <div />
              </div>

              {/* === 4 MOBILE CORNER HANDLES === */}
              {/* Top-Left Corner (NW) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
                className="absolute -top-3.5 -left-3.5 w-8 h-8 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                title="Drag corner"
              >
                <div className="w-5 h-5 border-t-[3.5px] border-l-[3.5px] border-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] rounded-tl-xs group-hover:scale-125 transition-transform" />
                <div className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-xs" />
              </div>

              {/* Top-Right Corner (NE) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
                className="absolute -top-3.5 -right-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                title="Drag corner"
              >
                <div className="w-5 h-5 border-t-[3.5px] border-r-[3.5px] border-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] rounded-tr-xs group-hover:scale-125 transition-transform" />
                <div className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-xs" />
              </div>

              {/* Bottom-Left Corner (SW) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
                className="absolute -bottom-3.5 -left-3.5 w-8 h-8 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30 group"
                title="Drag corner"
              >
                <div className="w-5 h-5 border-b-[3.5px] border-l-[3.5px] border-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] rounded-bl-xs group-hover:scale-125 transition-transform" />
                <div className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-xs" />
              </div>

              {/* Bottom-Right Corner (SE) */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'se')}
                className="absolute -bottom-3.5 -right-3.5 w-8 h-8 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30 group"
                title="Drag corner"
              >
                <div className="w-5 h-5 border-b-[3.5px] border-r-[3.5px] border-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] rounded-br-xs group-hover:scale-125 transition-transform" />
                <div className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-xs" />
              </div>

              {/* === 4 EDGE HANDLES (N, S, W, E) === */}
              {/* North / Top Bar */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'n')}
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-5 flex items-center justify-center cursor-ns-resize z-20"
              >
                <div className="w-7 h-1.5 bg-white/90 rounded-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
              </div>

              {/* South / Bottom Bar */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 's')}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 h-5 flex items-center justify-center cursor-ns-resize z-20"
              >
                <div className="w-7 h-1.5 bg-white/90 rounded-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
              </div>

              {/* West / Left Bar */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'w')}
                className="absolute top-1/2 -left-2 -translate-y-1/2 w-5 h-12 flex items-center justify-center cursor-ew-resize z-20"
              >
                <div className="h-7 w-1.5 bg-white/90 rounded-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
              </div>

              {/* East / Right Bar */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'e')}
                className="absolute top-1/2 -right-2 -translate-y-1/2 w-5 h-12 flex items-center justify-center cursor-ew-resize z-20"
              >
                <div className="h-7 w-1.5 bg-white/90 rounded-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 order-2 sm:order-1">
            <ImageIcon size={14} className="text-gray-400" />
            <span>Select <strong>Cancel</strong> to take the image without crop</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end order-1 sm:order-2">
            {/* CANCEL BUTTON: Takes image WITHOUT crop as requested by user */}
            <button
              type="button"
              onClick={handleCancelWithoutCrop}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              title="Continue with the full uncropped image"
            >
              <X size={15} className="text-gray-500" />
              <span>Cancel (Use Without Crop)</span>
            </button>

            {/* CONFIRM CROP BUTTON */}
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check size={16} />
              <span>{isProcessing ? 'Processing...' : 'Confirm Crop'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
