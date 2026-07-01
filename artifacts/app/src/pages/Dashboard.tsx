import { useListRecordings, useListGems } from "@workspace/api-client-react";
import type { Recording, GemWithRecording } from "@workspace/api-client-react";
import { Mic, Sparkles, AlertCircle, CheckCircle, Clock } from "lucide-react";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-gray-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

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

export default function Dashboard() {
  const { data: recordings } = useListRecordings();
  const { data: gems } = useListGems({ limit: 10 });

  const recs = recordings ?? [];
  const uploaded = recs.filter((r: Recording) => r.status === "uploaded").length;
  const transcribed = recs.filter((r: Recording) => r.status === "transcribed" || r.status === "analyzed" || r.status === "analyzing").length;
  const errors = recs.filter((r: Recording) => r.status === "error").length;

  const totalGems = gems?.reduce((sum: number, g: GemWithRecording) => sum + (g.gem ? 1 : 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Recordings" value={recs.length} icon={Mic} color="bg-blue-900/40 text-blue-400" />
        <StatCard label="Processed" value={transcribed} icon={CheckCircle} color="bg-green-900/40 text-green-400" />
        <StatCard label="Pending" value={uploaded} icon={Clock} color="bg-yellow-900/40 text-yellow-400" />
        <StatCard label="Gems Found" value={totalGems} icon={Sparkles} color="bg-purple-900/40 text-purple-400" />
      </div>

      {errors > 0 && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-300">{errors} recording(s) have errors</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Recent Recordings</h2>
          {recs.length === 0 ? (
            <p className="text-gray-500 text-sm">No recordings yet. Upload one to get started.</p>
          ) : (
            <div className="space-y-2">
              {recs.slice(0, 5).map((r: Recording) => (
                <a
                  key={r.id}
                  href={`/recordings/${r.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.filename}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Recent Gems</h2>
          {!gems || gems.length === 0 ? (
            <p className="text-gray-500 text-sm">No gems found yet. Analyze recordings to find insights.</p>
          ) : (
            <div className="space-y-2">
              {gems.slice(0, 5).map((g: GemWithRecording) => (
                <div key={g.gem.id} className="p-3 rounded-lg bg-gray-800/50">
                  <div className="flex items-center gap-2 mb-1">
                    <GemTypeBadge type={g.gem.type} />
                    <span className="text-xs text-gray-500">{g.recording.filename}</span>
                  </div>
                  <div className="text-sm font-medium">{g.gem.title}</div>
                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">{g.gem.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
