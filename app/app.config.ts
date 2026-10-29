export default defineAppConfig({
  ui: {
    colors: { primary: 'garden', secondary: 'lantern', neutral: 'stone', error: 'red', success: 'green', warning: 'amber', info: 'blue' },
    button: {
      slots: { base: 'rounded-lg font-medium cursor-pointer transition-colors', leadingIcon: 'shrink-0', trailingIcon: 'shrink-0' },
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'hover:bg-garden-800 active:bg-garden-900' },
        { color: 'secondary', variant: 'solid', class: 'text-garden-950 hover:bg-lantern-300 active:bg-lantern-500' },
        { color: 'error', variant: 'solid', class: 'hover:bg-red-800 active:bg-red-900' },
        { color: 'success', variant: 'solid', class: 'hover:bg-green-800 active:bg-green-900' },
        { color: 'warning', variant: 'solid', class: 'hover:bg-amber-900 active:bg-amber-950' },
        { color: 'info', variant: 'solid', class: 'hover:bg-blue-900 active:bg-blue-950' }
      ],
      defaultVariants: { size: 'lg' }
    },
    input: { slots: { base: 'rounded-lg min-h-11 text-base sm:text-base' }, defaultVariants: { size: 'lg' } },
    textarea: { slots: { base: 'rounded-lg text-base sm:text-base' }, defaultVariants: { size: 'lg' } },
    select: {
      slots: {
        base: 'rounded-lg min-h-11 text-base sm:text-base cursor-pointer',
        content: 'rounded-lg bg-(--surface-panel) ring-accented shadow-md',
        item: 'min-h-11 items-center cursor-pointer'
      },
      defaultVariants: { size: 'lg', position: 'popper' }
    },
    selectMenu: {
      slots: {
        base: 'rounded-lg min-h-11 text-base sm:text-base cursor-pointer',
        content: 'rounded-lg bg-(--surface-panel) ring-accented shadow-md',
        item: 'min-h-11 items-center cursor-pointer'
      },
      defaultVariants: { size: 'lg' }
    },
    checkbox: { slots: { base: 'rounded-[3px]' } },
    modal: {
      slots: { close: 'size-11', content: 'bg-(--surface-panel)' },
      variants: { fullscreen: { false: { content: 'rounded-(--panel-radius)' } } }
    },
    formField: { slots: { label: 'font-medium', error: 'text-sm', help: 'text-sm' } },
    alert: { defaultVariants: { variant: 'soft' } }
  }
})
