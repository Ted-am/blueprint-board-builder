-- Create bins table
CREATE TABLE public.bins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own bins" 
ON public.bins 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bins" 
ON public.bins 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bins" 
ON public.bins 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bins" 
ON public.bins 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create bin_frames table to store frames in bins
CREATE TABLE public.bin_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bin_id UUID NOT NULL REFERENCES public.bins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  slat_width INTEGER NOT NULL,
  slat_depth INTEGER NOT NULL,
  support_spacing INTEGER NOT NULL,
  covering_material TEXT NOT NULL,
  plywood_thickness INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.bin_frames ENABLE ROW LEVEL SECURITY;

-- Create policies for bin_frames
CREATE POLICY "Users can view frames in their bins" 
ON public.bin_frames 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.bins 
  WHERE bins.id = bin_frames.bin_id 
  AND bins.user_id = auth.uid()
));

CREATE POLICY "Users can create frames in their bins" 
ON public.bin_frames 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.bins 
  WHERE bins.id = bin_frames.bin_id 
  AND bins.user_id = auth.uid()
));

CREATE POLICY "Users can update frames in their bins" 
ON public.bin_frames 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.bins 
  WHERE bins.id = bin_frames.bin_id 
  AND bins.user_id = auth.uid()
));

CREATE POLICY "Users can delete frames from their bins" 
ON public.bin_frames 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.bins 
  WHERE bins.id = bin_frames.bin_id 
  AND bins.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates on bins
CREATE TRIGGER update_bins_updated_at
BEFORE UPDATE ON public.bins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update timestamps (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;