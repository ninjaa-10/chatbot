import React from 'react';
import { cn } from '../../lib/utils.js';

export const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => <input type={type} ref={ref} className={cn('ui-input', className)} {...props} />);
Input.displayName = 'Input';
