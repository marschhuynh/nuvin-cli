'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption<T = unknown> {
  value: string;
  label: string;
  data?: T;
  content?: React.ReactNode;
  searchContent?: string;
}

export interface ComboboxProps<T = unknown> {
  options: ComboboxOption<T>[];
  value?: string;
  onValueChange?: (value: string, option?: ComboboxOption<T>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  renderOption?: (option: ComboboxOption<T>, isSelected: boolean) => React.ReactNode;
  renderValue?: (option: ComboboxOption<T>) => React.ReactNode;
}

export function Combobox<T = unknown>({
  options,
  value: controlledValue,
  onValueChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found.',
  className,
  disabled = false,
  multiple = false,
  searchable = true,
  clearable = false,
  renderOption,
  renderValue,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState('');
  const [selectedValues, setSelectedValues] = React.useState<string[]>([]);

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internalValue;
  const currentValues = multiple ? selectedValues : [currentValue].filter(Boolean);

  const selectedOption = options.find((option) => option.value === currentValue);
  const selectedOptions = options.filter((option) => currentValues.includes(option.value));

  const handleSelect = (selectedValue: string) => {
    const option = options.find((opt) => opt.value === selectedValue);

    if (multiple) {
      const newValues = currentValues.includes(selectedValue)
        ? currentValues.filter((v) => v !== selectedValue)
        : [...currentValues, selectedValue];

      setSelectedValues(newValues);
      onValueChange?.(selectedValue, option);
    } else {
      const newValue = selectedValue === currentValue && clearable ? '' : selectedValue;

      if (!isControlled) {
        setInternalValue(newValue);
      }

      onValueChange?.(newValue, newValue ? option : undefined);
      setOpen(false);
    }
  };

  const getDisplayText = () => {
    if (multiple) {
      if (selectedOptions.length === 0) return placeholder;
      if (selectedOptions.length === 1) {
        const option = selectedOptions[0];
        return renderValue ? renderValue(option) : option.label;
      }
      return `${selectedOptions.length} selected`;
    }

    if (selectedOption) {
      return renderValue ? renderValue(selectedOption) : selectedOption.label;
    }

    return placeholder;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-[200px] justify-between min-h-[3rem] shadow-sm', className)}
          disabled={disabled}
        >
          {getDisplayText()}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} className="h-9" />}
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = multiple ? currentValues.includes(option.value) : currentValue === option.value;

                return (
                  <CommandItem
                    key={option.value}
                    value={option.searchContent || option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="px-2 py-3"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 min-w-0">
                        {renderOption ? renderOption(option, isSelected) : option.content || option.label}
                      </div>
                      <Check className={cn('ml-2 h-4 w-4 flex-shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
