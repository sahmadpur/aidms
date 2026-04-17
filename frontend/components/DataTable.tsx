import { ReactNode } from "react";
import { clsx } from "clsx";

export type Column<T> = {
  key: string;
  header: ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  minWidth = 900,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-auto rounded-[10px] border border-edge-soft bg-surface-card">
      <table className="w-full border-collapse" style={{ minWidth, tableLayout: "fixed" }}>
        <thead className="bg-surface-thead">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(
                  "px-3 py-2.5 text-[11px] font-semibold text-[#3b6d11] border-b border-edge-chip whitespace-nowrap",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.align !== "right" && c.align !== "center" && "text-left"
                )}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-gray-500 text-sm">
                {empty ?? "No data."}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-hover">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx(
                      "px-3 py-2.5 text-[12.5px] text-gray-900 border-b border-[#eef3e8] align-middle",
                      "overflow-hidden text-ellipsis whitespace-nowrap",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center"
                    )}
                    style={c.width ? { width: c.width } : undefined}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
