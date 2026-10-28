export default defineAppConfig({
  ui: {
    colors: { primary: 'garden', secondary: 'lantern', neutral: 'stone', error: 'red', success: 'green', warning: 'amber', info: 'blue' },
    button: {
      slots: { base: 'rounded-lg font-medium cursor-pointer transition-colors', leadingIcon: 'shrink-0', trailingIcon: 'shrink-0' },
      compoundVariants: [{ color: 'secondary', variant: 'solid', class: 'text-garden-950 hover:bg-lantern-300 active:bg-lantern-500' }],
      defaultVariants: { size: 'lg' }
    },
    input: { slots: { base: 'rounded-lg min-h-11' }, defaultVariants: { size: 'lg' } },
    textarea: { slots: { base: 'rounded-lg' }, defaultVariants: { size: 'lg' } },
    checkbox: { slots: { base: 'rounded-[3px]' } },
    modal: { variants: { fullscreen: { false: { content: 'rounded-(--panel-radius)' } } } },
    formField: { slots: { label: 'font-medium', error: 'text-sm', help: 'text-sm' } }
  }
})
