"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Upload, X } from "lucide-react";
import Cropper, { Area } from "react-easy-crop";
import api from "@/lib/api";

const ACCEPT_MIME = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Modal for picking a file, cropping it to a square, and POSTing the
 * resulting blob to /users/me/avatar. The backend re-encodes to JPEG
 * and caps at 512px, so we just need to send a reasonably sized crop.
 */
export function AvatarCropDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.avatar");
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setError(null);
    setUploading(false);
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(t("maxSize"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("maxSize"));
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_: Area, area: Area) => {
    setCroppedArea(area);
  }, []);

  async function confirm() {
    if (!src || !croppedArea) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await cropToBlob(src, croppedArea);
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      await api.post("/users/me/avatar", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      reset();
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Upload failed";
      setError(detail);
      setUploading(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 bg-surface-card border border-edge-soft rounded-[10px] shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-edge-soft flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-semibold text-ink">
              {t("cropTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1 text-ink-soft hover:text-ink rounded"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {src ? (
            <>
              <div className="relative w-full h-[320px] bg-paper-dim">
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="px-5 py-3 border-t border-edge-soft space-y-2.5">
                <label className="block">
                  <span className="block text-[11px] font-medium text-ink-soft mb-1">
                    {t("zoom")}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-brand"
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="p-8">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-edge-chip rounded-[10px] py-12 text-center text-ink-soft hover:border-brand-accent hover:bg-surface-hover transition-colors"
              >
                <Upload className="mx-auto w-7 h-7 mb-2" />
                <div className="text-[13px] font-medium text-ink">{t("dropOrClick")}</div>
                <div className="text-[11px] mt-1">{t("maxSize")}</div>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_MIME}
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
              />
            </div>
          )}

          {error && (
            <div className="px-5 py-2 text-[12px] text-danger-fg">{error}</div>
          )}

          <div className="px-5 py-3 border-t border-edge-soft flex items-center justify-end gap-2">
            {src && (
              <button
                type="button"
                onClick={reset}
                className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
              >
                {t("change")}
              </button>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-3.5 py-1.5 text-[12px] bg-surface-card border border-edge-chip text-ink rounded-[6px] hover:bg-surface-hover"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={!src || uploading}
              className="px-3.5 py-1.5 text-[12px] bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {uploading && <Loader2 className="w-3 h-3 animate-spin" />}
              {t("confirm")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Render the cropped region to a canvas and export as a JPEG Blob.
 */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
