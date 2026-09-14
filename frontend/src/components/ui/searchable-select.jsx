import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const SearchableSelect = React.forwardRef(({ 
  options = [], 
  value,
  onValueChange,
  onOpenChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search options...",
  emptyText = "No options found.",
  className,
  disabled = false,
  displayValue = "name",
  subTextValue = null,
  onOpen
}, ref) => {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen)
    if (onOpenChange) {
      onOpenChange(newOpen)
    }
    if (newOpen && onOpen) {
      onOpen()
    }
  }

  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    return options.filter(option =>
      option[displayValue]?.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [options, searchValue, displayValue])

  const selectedOption = options.find(option => option.id === value)

  return (
    <div className={cn("relative", className)} ref={ref}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedOption ? (
              <div className="flex flex-col items-start">
                <span>{selectedOption[displayValue]}</span>
                {subTextValue && selectedOption[subTextValue] && (
                  <span className="text-xs text-muted-foreground">{selectedOption[subTextValue]}</span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                             <Input
                 placeholder={searchPlaceholder}
                 value={searchValue}
                 onChange={(e) => setSearchValue(e.target.value)}
                 className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
               />
            </div>
            <CommandList className="max-h-60 overflow-y-scroll">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => {
                  const isSelected = option.id === value
                  return (
                    <CommandItem
                      key={option.id}
                      onSelect={() => {
                        onValueChange(option.id)
                        setOpen(false)
                        setSearchValue("")
                      }}
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
                      <div className="flex flex-col">
                        <span>{option[displayValue]}</span>
                        {subTextValue && option[subTextValue] && (
                          <span className="text-xs text-muted-foreground">{option[subTextValue]}</span>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
})

SearchableSelect.displayName = "SearchableSelect"

export { SearchableSelect }
