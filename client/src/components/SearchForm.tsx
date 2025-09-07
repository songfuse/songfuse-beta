import React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SearchFormProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  searchType: "title" | "description";
  setSearchType: (type: "title" | "description") => void;
  onSearch: (e: React.FormEvent) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchForm({
  searchQuery,
  setSearchQuery,
  inputValue,
  setInputValue,
  searchType,
  setSearchType,
  onSearch,
  placeholder,
  className = "",
}: SearchFormProps) {
  const handleClear = () => {
    setInputValue("");
    setSearchQuery("");
  };

  const defaultPlaceholder = searchType === "description" 
    ? "Search by description..." 
    : "Search by title...";

  return (
    <form onSubmit={onSearch} className={`flex flex-col gap-4 mb-8 md:flex-row ${className}`}>
      <div className="flex-1">
        <div className="relative w-full">
          <Input
            type="text"
            placeholder={placeholder || defaultPlaceholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearch(e);
              }
            }}
            className="bg-card border-border w-full text-foreground pr-10 pl-10"
          />
          {/* Search icon on the left */}
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          {/* Clear button on the right */}
          {inputValue && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/70 hover:text-foreground transition-colors"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex gap-2">
        <Select 
          value={searchType} 
          onValueChange={(value) => setSearchType(value as "title" | "description")}
        >
          <SelectTrigger className="bg-card border-border w-[180px] text-foreground">
            <SelectValue className="text-foreground" placeholder="Search by" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="description">Description</SelectItem>
          </SelectContent>
        </Select>
        
        <Button type="submit" className="bg-primary hover:bg-primary/80">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </div>
    </form>
  );
}
