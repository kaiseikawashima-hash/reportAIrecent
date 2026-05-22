"use client";

import { useRef } from "react";

interface Props {
  images: File[];
  onImagesChange: (images: File[]) => void;
}

export default function ScreenshotUploader({ images, onImagesChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter((f) => f.type.startsWith("image/"));
    if (valid.length !== files.length) {
      alert("画像ファイルのみアップロードできます");
    }
    onImagesChange([...images, ...valid]);
  }

  function handleRemove(index: number) {
    const updated = images.filter((_, i) => i !== index);
    onImagesChange(updated);
    if (updated.length === 0 && inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        スクショ（投稿サムネイル画像・任意）
      </label>
      <p className="text-xs text-gray-400 mb-2">
        フィードTOP3・ワースト3のサムネイル画像を複数枚アップロードできます
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
      />
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div
              key={`${img.name}-${i}`}
              className="relative group"
            >
              <img
                src={URL.createObjectURL(img)}
                alt={img.name}
                className="w-20 h-20 object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
