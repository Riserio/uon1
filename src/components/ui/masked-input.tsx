import { forwardRef } from 'react';
import { PatternFormat, PatternFormatProps } from 'react-number-format';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface MaskedInputProps extends Omit<PatternFormatProps, 'customInput'> {
  className?: string;
}

export const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <PatternFormat
        {...props}
        getInputRef={ref}
        customInput={Input}
        className={cn(className)}
      />
    );
  }
);

MaskedInput.displayName = 'MaskedInput';
