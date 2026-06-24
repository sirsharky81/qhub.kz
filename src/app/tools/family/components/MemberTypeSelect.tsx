"use client";

import {
  FAMILY_MEMBER_TYPES,
  MEMBER_TYPE_LABELS,
  type FamilyMemberType,
} from "@/lib/family/member-types";

interface Props {
  value: FamilyMemberType;
  onChange: (value: FamilyMemberType) => void;
}

export function MemberTypeSelect({ value, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-700">Роль участника</p>
      <div className="grid grid-cols-1 gap-1.5">
        {FAMILY_MEMBER_TYPES.map((type) => (
          <label
            key={type}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
              value === type ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="memberType"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
              className="accent-gray-900"
            />
            <span className="text-xs">{MEMBER_TYPE_LABELS[type]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
