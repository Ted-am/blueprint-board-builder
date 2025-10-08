import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Language } from "@/lib/translations";
import { Languages } from "lucide-react";

interface LanguageSelectorProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export const LanguageSelector = ({ language, onLanguageChange }: LanguageSelectorProps) => {
  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <Select value={language} onValueChange={(value) => onLanguageChange(value as Language)}>
        <SelectTrigger className="w-[140px] font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card z-50">
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="ru">Русский</SelectItem>
          <SelectItem value="he">עברית</SelectItem>
          <SelectItem value="th">ไทย</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
