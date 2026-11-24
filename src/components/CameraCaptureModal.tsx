import React from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  RefreshCw,
  SwitchCamera,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmPhoto: (file: File) => void;
  onFallbackFileUpload: () => void;
}

export function CameraCaptureModal({
  open,
  onClose,
  onConfirmPhoto,
  onFallbackFileUpload,
}: CameraCaptureModalProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = React.useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = React.useState(false);
  const [cameraState, setCameraState] = React.useState<
    'starting' | 'ready' | 'captured' | 'error'
  >('starting');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [capturedFile, setCapturedFile] = React.useState<File | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = React.useState<string | null>(null);

  const stopActiveStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearPreview = React.useCallback(() => {
    setCapturedFile(null);
    setCapturedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const startCamera = React.useCallback(
    async (preferredMode: 'environment' | 'user') => {
      stopActiveStream();
      setCameraState('starting');
      setErrorMessage(null);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraState('error');
        setErrorMessage(
          'Live camera capture is not supported in this browser or context. You can upload an image file instead.',
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: preferredMode } },
            audio: false,
          });
        } catch (primaryErr) {
          // Desktop fallback when facingMode constraint cannot be satisfied
          if (
            primaryErr instanceof DOMException &&
            (primaryErr.name === 'OverconstrainedError' ||
              primaryErr.name === 'ConstraintNotSatisfiedError')
          ) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } else {
            throw primaryErr;
          }
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState('ready');

        if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === 'videoinput');
            setHasMultipleCameras(videoInputs.length > 1);
          } catch {
            setHasMultipleCameras(false);
          }
        }
      } catch (err) {
        stopActiveStream();
        setCameraState('error');
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setErrorMessage(
              'Camera permission was denied. Allow camera access in your browser settings or upload an image file instead.',
            );
            return;
          }
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setErrorMessage(
              'No camera device was detected on this device. Upload an image file instead.',
            );
            return;
          }
          if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            setErrorMessage(
              'Your camera is currently busy in another application. Close the other app or upload an image file.',
            );
            return;
          }
        }
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Unable to open camera preview. You can upload an image file instead.',
        );
      }
    },
    [stopActiveStream],
  );

  React.useEffect(() => {
    if (!open) {
      stopActiveStream();
      clearPreview();
      return;
    }

    void startCamera(facingMode);

    return () => {
      stopActiveStream();
      clearPreview();
    };
  }, [open, facingMode, startCamera, stopActiveStream, clearPreview]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopActiveStream();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, stopActiveStream]);

  if (!open) return null;

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage('Camera feed is still initializing. Wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMessage('Could not capture frame from camera.');
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage('Failed to encode captured image.');
          return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `nexus-capture-${timestamp}.jpg`, {
          type: 'image/jpeg',
        });
        const previewUrl = URL.createObjectURL(blob);
        stopActiveStream();
        setCapturedFile(file);
        setCapturedPreviewUrl(previewUrl);
        setCameraState('captured');
      },
      'image/jpeg',
      0.9,
    );
  };

  const handleRetake = () => {
    clearPreview();
    void startCamera(facingMode);
  };

  const handleRemoveAndCancel = () => {
    stopActiveStream();
    clearPreview();
    onClose();
  };

  const handleConfirm = () => {
    if (!capturedFile) return;
    const fileToAttach = capturedFile;
    stopActiveStream();
    clearPreview();
    onConfirmPhoto(fileToAttach);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      data-testid="camera-capture-modal"
      className="fixed inset-0 z-[75] bg-[#172033]/65 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-[#DFE5F0] rounded-[14px] w-full max-w-lg overflow-hidden shadow-xl">
        <div className="px-5 py-3.5 border-b border-[#DFE5F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#365BEE]" />
            <h2
              id="camera-capture-title"
              className="font-display font-semibold text-base text-[#172033]"
            >
              Capture a photo
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cancel camera capture"
            onClick={handleRemoveAndCancel}
            className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative rounded-[10px] overflow-hidden bg-[#172033] aspect-[4/3] flex items-center justify-center border border-[#DFE5F0]">
            {cameraState === 'captured' && capturedPreviewUrl ? (
              <img
                src={capturedPreviewUrl}
                alt="Captured doubt preview"
                className="w-full h-full object-contain bg-[#172033]"
              />
            ) : cameraState === 'error' ? (
              <div className="p-6 text-center space-y-3 text-white max-w-sm">
                <AlertCircle className="w-8 h-8 text-[#FF694F] mx-auto" />
                <p className="text-xs leading-relaxed text-[#DFE5F0]">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    stopActiveStream();
                    clearPreview();
                    onClose();
                    onFallbackFileUpload();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4]"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload image file instead</span>
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {cameraState === 'starting' && (
                  <div className="absolute inset-0 bg-[#172033]/75 flex items-center justify-center text-xs text-white font-mono">
                    Requesting camera permission...
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-[11px] text-[#687386]">
            {cameraState === 'captured'
              ? 'Review your photo before attaching it. Images upload only when you publish your doubt.'
              : 'Frame your textbook page, handwritten derivation, circuit, or screen error clearly.'}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#DFE5F0]">
            <button
              type="button"
              onClick={handleRemoveAndCancel}
              className="px-3.5 py-2 text-xs font-medium text-[#687386] hover:text-[#172033]"
            >
              Cancel
            </button>

            {cameraState === 'captured' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemoveAndCancel}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#DFE5F0] text-[#C4422C] rounded-[8px] hover:bg-[#FF694F]/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#DFE5F0] text-[#172033] rounded-[8px] hover:bg-[#F5F5F0]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Use photo</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {hasMultipleCameras && cameraState === 'ready' && (
                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#DFE5F0] text-[#172033] rounded-[8px] hover:bg-[#F5F5F0]"
                  >
                    <SwitchCamera className="w-3.5 h-3.5" />
                    <span>Switch camera</span>
                  </button>
                )}
                {cameraState === 'error' ? (
                  <button
                    type="button"
                    onClick={() => void startCamera(facingMode)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-[#DFE5F0] text-[#172033] rounded-[8px] hover:bg-[#F5F5F0]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry camera</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={cameraState !== 'ready'}
                    onClick={handleCaptureFrame}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4] disabled:opacity-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
