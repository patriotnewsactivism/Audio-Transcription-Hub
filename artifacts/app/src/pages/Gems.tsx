import { useState } from "react";
import { useListGems } from "@workspace/api-client-react";
import type { GemWithRecording, ListGemsType } from "@workspace/api-client-react";
import { Loader2, Search, Sparkles, Clock, User } from "lucide-react";

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

const GEM_TYPES = ["action_item", "customer_insight", "sentiment_peak", "key_quote", "decision"];

export default function Gems() {
  const [typeFilter, setTypeFilter] = useState<ListGemsType | "">("");
  const [search, setSearch] = useState("");

  const { data: gems, isLoading } = useListGems({
    type: typeFilter || undefined,
    search: search || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gems Explorer</h1>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gems..."
            className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setTypeFilter("")}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              typeFilter === "" ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"
            }`}
          >
            All
          </button>
          {GEM_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t === typeFilter ? "" : t as ListGemsType)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                typeFilter === t ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !gems || gems.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No gems found</p>
          <p className="text-sm mt-1">Analyze transcribed recordings to discover gems</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gems.map((item: GemWithRecording) => (
            <a
              key={item.gem.id}
              href={`/recordings/${item.recording.id}`}
              className="block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <GemTypeBadge type={item.gem.type} />
                    <span className="text-xs text-gray-500">{item.recording.filename}</span>
                  </div>
                  <div className="font-medium">{item.gem.title}</div>
                  <div className="text-sm text-gray-400 mt-1">{item.gem.content}</div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {item.gem.startTime != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(item.gem.startTime)}
                        {item.gem.endTime != null && ` - ${formatTimestamp(item.gem.endTime)}`}
                      </span>
                    )}
                    {item.gem.speaker && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {item.gem.speaker}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
