import { forwardRef } from 'react';
import { NumericFormat, NumericFormatProps } from 'react-number-format';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface CurrencyInputProps extends Omit<NumericFormatProps, 'customInput'> {
  className?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <NumericFormat
        {...props}
        getInputRef={ref}
        customInput={Input}
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        fixedDecimalScale
        allowNegative={false}
        className={cn(className)}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
