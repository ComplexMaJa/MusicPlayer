import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  label,
  description,
}) => {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center justify-between cursor-pointer select-none group ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex flex-col gap-0.5 pr-4">
          {label && <p className="text-xs font-semibold text-white group-hover:text-white transition-colors">{label}</p>}
          {description && <p className="text-[11px] text-[#666666] font-light">{description}</p>}
        </div>
      )}

      <div
        className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 flex items-center relative shrink-0 ${
          checked
            ? 'shadow-lg'
            : 'bg-[#151515] border border-[#242424] group-hover:border-[#333333]'
        }`}
        style={
          checked
            ? {
                backgroundColor: 'var(--accent-color, #FF2E55)',
                boxShadow: '0 0 12px var(--accent-glow, rgba(255, 46, 85, 0.4))',
              }
            : undefined
        }
      >
        <div
          className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ease-out flex items-center justify-center ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        >
          {checked && (
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-color, #FF2E55)' }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
