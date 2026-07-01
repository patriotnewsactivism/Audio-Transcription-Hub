import { useGetRecording, useGetRecordingGems, useTranscribeRecording, useAnalyzeRecording } from "@workspace/api-client-react";
import type { Gem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Sparkles, Clock, User, MessageSquare } from "lucide-react";

function GemTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    action_item: "bg-blue-900 text-blue-300",
    customer_insight: "bg-purple-900 text-purple-300",
    sentiment_peak: "bg-yellow-900 text-yellow-300",
    key_quote: "bg-green-900 text-green-300",
    decision: "bg-orange-900 text-orange-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || "bg-gray-700"}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function RecordingDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const queryClient = useQueryClient();
  const { data: detail, isLoading } = useGetRecording(id);
  const { data: gems } = useGetRecordingGems(id, {});

  const transcribeMutation = useTranscribeRecording({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["getRecording", id] });
        queryClient.invalidateQueries({ queryKey: ["getRecordingGems", id] });
      },
    },
  });

  const analyzeMutation = useAnalyzeRecording({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["getRecording", id] });
        queryClient.invalidateQueries({ queryKey: ["getRecordingGems", id] });
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!detail) {
    return <div className="text-center py-20 text-gray-500">Recording not found</div>;
  }

  const { recording, transcript } = detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{recording?.filename}</h1>
          <div className="text-sm text-gray-400 mt-1">
            {recording?.createdAt && new Date(recording.createdAt).toLocaleString()}
            {recording?.duration && ` · ${Math.floor(recording.duration / 60)}m ${Math.floor(recording.duration % 60)}s`}
          </div>
        </div>
        <div className="flex gap-2">
          {(recording?.status === "uploaded" || recording?.status === "error") && (
            <button
              onClick={() => transcribeMutation.mutate({ id })}
              disabled={transcribeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-sm"
            >
              {transcribeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Transcribe
            </button>
          )}
          {recording?.status === "transcribed" && (
            <button
              onClick={() => analyzeMutation.mutate({ id })}
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium text-sm"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Analyze for Gems
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {transcript ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-400" />
                Transcript
              </h2>
              <div className="text-sm text-gray-400 mb-3">
                {transcript.speakerCount && `${transcript.speakerCount} speakers`}
                {transcript.wordCount && ` · ${transcript.wordCount} words`}
                {transcript.confidence && ` · ${(transcript.confidence * 100).toFixed(1)}% confidence`}
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto bg-gray-950 rounded-lg p-4">
                {transcript.fullText || "(no text)"}
              </pre>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-500">
              <p>No transcript yet. Click "Transcribe" to process this recording.</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Gems
              {gems && <span className="text-sm font-normal text-gray-500">({gems.length})</span>}
            </h2>
            {!gems || gems.length === 0 ? (
              <p className="text-sm text-gray-500">
                {recording?.status === "analyzed"
                  ? "No gems identified"
                  : "Analyze the transcript to find gems"}
              </p>
            ) : (
              <div className="space-y-3">
                {gems.map((gem: Gem) => (
                  <div key={gem.id} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <GemTypeBadge type={gem.type} />
                    </div>
                    <div className="text-sm font-medium">{gem.title}</div>
                    <div className="text-xs text-gray-400 mt-1">{gem.content}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {gem.startTime != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(gem.startTime)}
                          {gem.endTime != null && ` - ${formatTimestamp(gem.endTime)}`}
                        </span>
                      )}
                      {gem.speaker && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {gem.speaker}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
