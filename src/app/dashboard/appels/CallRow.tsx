"use client";

import { useState } from "react";

interface CallRowProps {
  name: string;
  phone: string;
  date: string;
  duration: string;
  summary: string;
  transcript?: string;
  hasRdv: boolean;
}

export function CallRow({ name, phone, date, duration, summary, transcript, hasRdv }: CallRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => transcript && setExpanded((v) => !v)}
      >
        <td className="px-5 py-4">
          <div className="font-medium text-gray-900">{name}</div>
          {phone && <div className="text-xs text-gray-400 mt-0.5">{phone}</div>}
        </td>
        <td className="px-5 py-4 text-gray-500 hidden md:table-cell whitespace-nowrap">
          {date}
        </td>
        <td className="px-5 py-4 text-gray-500 hidden lg:table-cell whitespace-nowrap">
          {duration}
        </td>
        <td className="px-5 py-4 text-gray-500 max-w-xs">
          <span className="line-clamp-2 text-sm">{summary}</span>
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            {hasRdv ? (
              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                ✅ RDV
              </span>
            ) : (
              <span className="inline-flex items-center bg-gray-100 text-gray-400 text-xs font-medium px-2.5 py-1 rounded-full">
                Pas de RDV
              </span>
            )}
            {transcript && (
              <span className="text-gray-300 text-xs">
                {expanded ? "▲" : "▼"}
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && transcript && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-5 py-4">
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Transcription
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white border border-gray-100 rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
              {transcript}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
