import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface EmbeddingStats {
  total: number;
  withEmbeddings: number;
  withoutEmbeddings: number;
  percentage: string;
  lastUpdated: string;
}

interface TaskInfo {
  id: string;
  type: string;
  status: string;
  startTime: string;
  runTime: string;
}

const EmbeddingMonitor = () => {
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Fetch embedding statistics
  const { data: stats, refetch: refetchStats, isLoading: statsLoading } = useQuery<EmbeddingStats>({
    queryKey: ['/api/embedding-status'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch all tasks
  const { data: tasksData, refetch: refetchTasks, isLoading: tasksLoading } = useQuery<{ success: boolean; tasks: TaskInfo[] }>({
    queryKey: ['/api/embeddings/tasks'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch selected task details (if any)
  const { data: taskDetails, refetch: refetchTaskDetails } = useQuery<{ success: boolean; status: string; recentOutput: string[] }>({
    queryKey: ['/api/embeddings/status', selectedTaskId],
    enabled: !!selectedTaskId,
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const startProcess = async () => {
    try {
      setStarting(true);
      const response = await fetch('/api/embeddings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      if (data.success && data.taskId) {
        setSelectedTaskId(data.taskId);
        await Promise.all([refetchStats(), refetchTasks()]);
      }
    } catch (error) {
      console.error('Error starting embedding process:', error);
    } finally {
      setStarting(false);
    }
  };

  const stopProcess = async (taskId: string) => {
    try {
      setStopping(true);
      await fetch(`/api/embeddings/stop/${taskId}`, {
        method: 'POST',
      });
      await Promise.all([refetchStats(), refetchTasks()]);
    } catch (error) {
      console.error('Error stopping embedding process:', error);
    } finally {
      setStopping(false);
    }
  };

  const refreshAll = () => {
    refetchStats();
    refetchTasks();
    if (selectedTaskId) {
      refetchTaskDetails();
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Track Embedding Monitor</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stats Card */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Embedding Statistics</span>
              <Button variant="ghost" size="sm" onClick={refreshAll} disabled={statsLoading}>
                <RefreshCw className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Progress:</span>
                  <span className="text-primary">{stats.percentage}</span>
                </div>
                
                <Progress value={parseFloat(stats.percentage)} className="h-2" />
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Tracks</div>
                    <div className="font-medium">{stats.total}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Vectorized</div>
                    <div className="font-medium">{stats.withEmbeddings}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Remaining</div>
                    <div className="font-medium">{stats.withoutEmbeddings}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Updated</div>
                    <div className="font-medium">{formatDate(stats.lastUpdated)}</div>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button 
                    variant="default" 
                    onClick={startProcess} 
                    disabled={starting || (tasksData?.tasks?.some(t => t.status === 'running') ?? false)}
                  >
                    {starting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" /> Start Embedding Process
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Tasks Card */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Active Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : tasksData?.tasks?.length ? (
              <div className="space-y-4">
                {tasksData.tasks.map((task) => (
                  <div key={task.id} className="p-4 border rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{task.type} Task</span>
                      <span 
                        className={`px-2 py-1 text-xs rounded-full ${task.status === 'running' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}
                      >
                        {task.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Started:</span>
                        <span className="ml-2">{formatDate(task.startTime)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Runtime:</span>
                        <span className="ml-2">{task.runTime}</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelectedTaskId(task.id)}
                        className={selectedTaskId === task.id ? 'border-primary' : ''}
                      >
                        View Details
                      </Button>
                      {task.status === 'running' && (
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => stopProcess(task.id)}
                          disabled={stopping}
                        >
                          {stopping ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Stopping
                            </>
                          ) : (
                            <>
                              <Square className="mr-1 h-3 w-3" fill="currentColor" /> Stop
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground">
                No active embedding tasks
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task Output */}
      {selectedTaskId && taskDetails && (
        <Card className="mt-6 shadow-md">
          <CardHeader>
            <CardTitle>Task Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-500 font-mono p-4 rounded-md h-[400px] overflow-y-auto text-sm">
              {taskDetails.recentOutput?.map((line, index) => (
                <div key={index}>{line}</div>
              )) || 'No output available'}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmbeddingMonitor;
