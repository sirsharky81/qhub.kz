type TestingBadgeSize = "sm" | "md";

interface TestingBadgeProps {
  size?: TestingBadgeSize;
  className?: string;
}

const sizeClass: Record<TestingBadgeSize, string> = {
  sm: "text-[9px] px-1.5 py-0.5",
  md: "text-[10px] px-2 py-0.5",
};

export default function TestingBadge({ size = "md", className = "" }: TestingBadgeProps) {
  return (
    <span
      className={
        "font-mono uppercase tracking-widest rounded-full border border-amber-300 text-amber-700 bg-amber-50 whitespace-nowrap " +
        sizeClass[size] +
        (className ? ` ${className}` : "")
      }
    >
      Тестирование
    </span>
  );
}
