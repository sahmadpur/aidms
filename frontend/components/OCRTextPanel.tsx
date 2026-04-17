"use client";

interface Props {
  ocrText: string;
}

export default function OCRTextPanel({ ocrText }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700">OCR Text</h3>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
          {ocrText || "No OCR text available."}
        </pre>
      </div>
    </div>
  );
}
