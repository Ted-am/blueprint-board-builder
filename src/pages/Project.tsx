import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BlindGenerator from "@/components/BlindGenerator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const Project = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [projectData, setProjectData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const autoSaveInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProject();
    
    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
      }
    };
  }, [id]);

  useEffect(() => {
    if (projectData) {
      // Start auto-save every 60 seconds
      autoSaveInterval.current = setInterval(() => {
        saveProject(projectData, true);
      }, 60000);
    }

    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
      }
    };
  }, [projectData]);

  const loadProject = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      
      setProjectName(data.name);
      setProjectData(data.data || {});
    } catch (error) {
      toast.error("Failed to load project");
      navigate("/projects");
    } finally {
      setLoading(false);
    }
  };

  const saveProject = async (data: any, isAutoSave = false) => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ data })
        .eq("id", id);

      if (error) throw error;
      
      if (!isAutoSave) {
        toast.success("Project saved");
      }
    } catch (error) {
      if (!isAutoSave) {
        toast.error("Failed to save project");
      }
    }
  };

  const handleDataChange = (newData: any) => {
    setProjectData(newData);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 border-b flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">{projectName}</h1>
      </div>
      <BlindGenerator 
        initialData={projectData}
        onDataChange={handleDataChange}
        onSave={() => saveProject(projectData)}
      />
    </div>
  );
};

export default Project;
