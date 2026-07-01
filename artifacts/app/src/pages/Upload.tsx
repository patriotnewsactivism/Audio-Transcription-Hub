import { useState, useRef } from "react";
import { useUploadRecording, useListRecordings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Upload as UploadIcon, Loader2 } from "lucide-react";

export default function Upload() {
  const [, setLocation] = useLocation();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { refetch } = useListRecordings();

  const uploadMutation = useUploadRecording({
    mutation: {
      onSuccess: () => {
        refetch();
        setLocation("/recordings");
      },
    },
  });

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const supported = ["mp3", "wav", "m4a", "mp4"];
    if (!ext || !supported.includes(ext)) {
      alert(`Unsupported file type. Supported: ${supported.join(", ")}`);
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate({ file: selectedFile } as any);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Upload Recording</h1>

      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver ? "border-blue-500 bg-blue-900/20" : "border-gray-700 hover:border-gray-600"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {selectedFile ? (
          <div className="space-y-3">
            <div className="text-lg font-medium">{selectedFile.name}</div>
            <div className="text-sm text-gray-400">{formatSize(selectedFile.size)}</div>
            <button
              onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Choose different file
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <UploadIcon className="w-10 h-10 mx-auto text-gray-500" />
            <div className="text-gray-400">
              Drag & drop an audio file here, or{" "}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:underline"
              >
                browse
              </button>
            </div>
            <div className="text-xs text-gray-600">MP3, WAV, M4A, MP4 — up to 1 GB</div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.mp4"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!selectedFile || uploadMutation.isPending}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium flex items-center justify-center gap-2"
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          "Upload & Process"
        )}
      </button>

      {uploadMutation.error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {String(uploadMutation.error)}
        </div>
      )}
    </div>
  );
}
