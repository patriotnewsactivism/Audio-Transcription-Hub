import { useListRecordings, useDeleteRecording, useTranscribeRecording, useAnalyzeRecording } from "@workspace/api-client-react";
import type { Recording } from "@workspace/api-client-react";
import { Loader2, Trash2, Play, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    uploaded: "bg-gray-700 text-gray-300",
    transcribing: "bg-blue-900 text-blue-300",
    transcribed: "bg-green-900 text-green-300",
    analyzing: "bg-purple-900 text-purple-300",
    analyzed: "bg-emerald-900 text-emerald-300",
    error: "bg-red-900 text-red-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.uploaded}`}>
      {status}
    </span>
  );
}

export default function Recordings() {
  const { data: recordings, isLoading } = useListRecordings();
  const queryClient = useQueryClient();

  const deleteMutation = useDeleteRecording({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listRecordings"] }),
    },
  });

  const transcribeMutation = useTranscribeRecording({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listRecordings"] }),
    },
  });

  const analyzeMutation = useAnalyzeRecording({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["listRecordings"] }),
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const recs = recordings ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Recordings</h1>

      {recs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No recordings yet</p>
          <a href="/upload" className="text-blue-400 hover:underline text-sm">Upload your first recording</a>
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map((r: Recording) => (
            <div
              key={r.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4"
            >
              <a href={`/recordings/${r.id}`} className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.filename}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.duration && ` · ${Math.floor(r.duration / 60)}m ${Math.floor(r.duration % 60)}s`}
                  {r.error && <span className="text-red-400 ml-2">{r.error}</span>}
                </div>
              </a>
              <StatusBadge status={r.status} />
              <div className="flex gap-1">
                {(r.status === "uploaded" || r.status === "error") && (
                  <button
                    onClick={() => transcribeMutation.mutate({ id: r.id })}
                    disabled={transcribeMutation.isPending}
                    className="p-2 rounded-lg bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 disabled:opacity-50"
                    title="Transcribe"
                  >
                    {transcribeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                )}
                {r.status === "transcribed" && (
                  <button
                    onClick={() => analyzeMutation.mutate({ id: r.id })}
                    disabled={analyzeMutation.isPending}
                    className="p-2 rounded-lg bg-purple-900/30 text-purple-400 hover:bg-purple-900/50 disabled:opacity-50"
                    title="Analyze for gems"
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Delete "${r.filename}"?`)) deleteMutation.mutate({ id: r.id });
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-2 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
