import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

const MultiSelect = React.forwardRef(({ 
  options = [], 
  selected = [], 
  onChange,
  onSelectionChange,
  onOpenChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search options...",
  emptyText = "No options found.",
  className,
  disabled = false,
  displayValue = "name",
  subTextValue = null
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  // Use onChange if provided, otherwise fall back to onSelectionChange
  const handleSelectionChange = onChange || onSelectionChange

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen)
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
  }

  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    return options.filter(option =>
      option[displayValue]?.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [options, searchValue, displayValue])

  const handleSelect = (option) => {
    const isSelected = selected.some(item => item.id === option.id)
    let newSelected

    if (isSelected) {
      newSelected = selected.filter(item => item.id !== option.id)
    } else {
      newSelected = [...selected, option]
    }

    handleSelectionChange(newSelected)
  }

  const handleRemove = (optionToRemove) => {
    const newSelected = selected.filter(item => item.id !== optionToRemove.id)
    handleSelectionChange(newSelected)
  }

  const handleRemoveAll = () => {
    handleSelectionChange([])
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-10 items-start py-2"
            disabled={disabled}
          >
            <div className="flex flex-wrap gap-1 max-w-[calc(100%-24px)] max-h-[144px] overflow-y-auto">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((option) => (
                  <Badge
                    key={option.id}
                    variant="secondary"
                    className="mr-1 mb-1"
                  >
                    {option[displayValue]}
                    <span
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer inline-flex items-center justify-center"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          handleRemove(option)
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemove(option)
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </span>
                  </Badge>
                ))
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 mt-0.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList 
              className="max-h-60 overflow-y-scroll"
              onWheel={(e) => {
                // Prevent event bubbling to ensure scroll works
                e.stopPropagation()
              }}
            >
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => {
                  const isSelected = selected.some(item => item.id === option.id)
                  return (
                    <CommandItem
                      key={option.id}
                      onSelect={() => handleSelect(option)}
                    >
                      <div
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "opacity-50 [&_svg]:invisible"
                        )}
                      >
                        <Check className={cn("h-4 w-4")} />
                      </div>
                      <div 
                        className="flex flex-col flex-1 cursor-pointer"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleSelect(option)
                        }}
                      >
                        <span>{option[displayValue]}</span>
                        {subTextValue && option[subTextValue] && (
                          <span className="text-xs text-muted-foreground">{option[subTextValue]}</span>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              {selected.length > 0 && (
                <CommandGroup>
                  <CommandItem 
                    onSelect={handleRemoveAll}
                  >
                    <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-destructive">
                      <X className="h-4 w-4 text-destructive" />
                    </div>
                    <div 
                      className="flex-1 cursor-pointer"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleRemoveAll()
                      }}
                    >
                      Clear all selections
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
})

MultiSelect.displayName = "MultiSelect"

export { MultiSelect }
