import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva('ui-button', {
  variants: {
    variant: { default: 'ui-button-default', outline: 'ui-button-outline', ghost: 'ui-button-ghost' },
    size: { default: 'ui-button-md', sm: 'ui-button-sm', icon: 'ui-button-icon' }
  }, defaultVariants: { variant: 'default', size: 'default' }
});

export const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
