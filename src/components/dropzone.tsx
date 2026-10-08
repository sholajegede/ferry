"use client";

import { FolderUp, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FileSource } from "@/lib/protocol/types";
import { useClientValue } from "@/lib/web/hooks";
import { fromDataTransfer, fromFileList } from "@/lib/web/sources";
import { Button } from "./ui";

export function Dropzone({
  onFiles,
  title,
  hint,
  compact,
}: {
  onFiles(files: FileSource[]): void;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const folders = useClientValue(
    () =>
      "webkitdirectory" in document.createElement("input") &&
      !/Android|iPhone|iPad/.test(navigator.userAgent),
    false,
  );
  const depth = useRef(0);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, [folders]);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        void fromDataTransfer(event.dataTransfer).then((files) => {
          if (files.length > 0) onFiles(files);
        });
      }}
      className={`rounded-[20px] border border-dashed border-sea text-center transition-colors ${
        over ? "bg-lilac" : "bg-sunken"
      } ${compact ? "px-4 py-8" : "px-6 py-12"}`}
    >
      <p className={`serif !font-bold ${compact ? "text-xl" : "text-[1.75rem]"}`}>{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink/80">{hint}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button onClick={() => fileInput.current?.click()} size={compact ? "md" : "lg"}>
          <Upload size={18} aria-hidden /> Choose files
        </Button>
        {folders && (
          <Button
            variant="secondary"
            onClick={() => folderInput.current?.click()}
            size={compact ? "md" : "lg"}
          >
            <FolderUp size={18} aria-hidden /> Choose a folder
          </Button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) onFiles(fromFileList(event.target.files));
          event.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) onFiles(fromFileList(event.target.files));
          event.target.value = "";
        }}
      />
    </div>
  );
}
