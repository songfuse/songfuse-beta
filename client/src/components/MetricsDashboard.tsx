import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Users, Link, TrendingUp, BarChart3, Activity, ListMusic, Calendar } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAuth } from "@/contexts/AuthContext";

interface DashboardMetrics {
  database: {
    totalTracks: number;
    totalArtists: number;
    totalAlbums: number;
    totalUserPlaylists: number;
    avgPlaylistLength: number;
  };
  smartLinks: {
    totalSmartLinks: number;
    totalViews: number;
    avgViewsPerLink: number;
    topPerformingLinks: Array<{
      id: number;
      shareId: string;
      title: string;
      views: number;
      playlistTitle: string;
      playlistId: number;
      createdAt: string;
    }>;
    viewsOverTime: Array<{
      date: string;
      views: number;
      linksCreated: number;
    }>;
  };
  userActivity: {
    totalUsers: number;
    activeUsers: number;
    playlistsCreatedToday: number;
    playlistsCreatedThisWeek: number;
    smartLinksCreatedToday: number;
    smartLinksCreatedThisWeek: number;
  };
}

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
}

const MetricCard = ({ title, value, description, icon, trend, className = "" }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className={className}
  >
    <Card className="hover:shadow-lg transition-shadow duration-300 rounded-xl h-32 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div className="text-2xl font-bold text-foreground">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div className="mt-auto">
          {description && (
            <p className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
          {trend && (
            <div className="flex items-center mt-1">
              <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
              <span className="text-xs text-green-500 font-medium">
                +{trend.value} {trend.label}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function MetricsDashboard() {
  // Safely access auth context
  let user: any = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch (error) {
    // Auth context not available yet, handle gracefully
    console.log("Auth context not yet available in MetricsDashboard");
  }
  
  const { data: metrics, isLoading, error } = useQuery<DashboardMetrics>({
    queryKey: user ? ['/api/dashboard/user-metrics', user.id] : ['/api/dashboard/metrics'],
    queryFn: async () => {
      const endpoint = user ? `/api/dashboard/users/${user.id}/metrics` : '/api/dashboard/metrics';
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      return response.json();
    },
    enabled: !!user, // Only fetch when user is available
    staleTime: 0, // Always consider data stale
    gcTime: 0, // Don't cache results
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Unable to Load Metrics</CardTitle>
          <CardDescription>
            There was an issue fetching the dashboard data. Please try again later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Create simple, accurate chart data showing current stats
  const chartData = [
    {
      name: 'Your Playlists',
      value: Number(metrics.database.totalUserPlaylists),
      color: '#10b981'
    },
    {
      name: 'Playlist Sharing Links',
      value: Number(metrics.smartLinks.totalSmartLinks),
      color: '#06b6d4'
    },
    {
      name: 'Total Views',
      value: Number(metrics.smartLinks.totalViews),
      color: '#8b5cf6'
    }
  ];

  return (
    <div className="space-y-8">

      {/* Database Statistics */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <h3 className="text-xl font-semibold mb-4 flex items-center text-foreground">
          <Music className="h-5 w-5 mr-2 text-primary" />
          Music Database
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Your Playlists"
            value={metrics.database.totalUserPlaylists}
            description={metrics.database.totalUserPlaylists === 0 ? "Start creating playlists!" : `${metrics.database.totalUserPlaylists} playlist${metrics.database.totalUserPlaylists === 1 ? '' : 's'} created`}
            icon={<ListMusic className="h-4 w-4" />}
            trend={metrics.userActivity.playlistsCreatedThisWeek > 0 ? {
              value: metrics.userActivity.playlistsCreatedThisWeek,
              label: "this week"
            } : undefined}
          />
          <MetricCard
            title="Your Tracks"
            value={metrics.database.totalTracks}
            description="Unique songs in your playlists"
            icon={<Music className="h-4 w-4" />}
          />
          <MetricCard
            title="Your Artists"
            value={metrics.database.totalArtists}
            description="Musicians in your collection"
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      </motion.div>

      {/* Playlist Sharing Links Performance */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <h3 className="text-xl font-semibold mb-4 flex items-center text-foreground">
          <Link className="h-5 w-5 mr-2 text-primary" />
          Playlist Sharing Links Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="Total Playlist Sharing Links"
            value={metrics.smartLinks.totalSmartLinks}
            description="Shareable playlists"
            icon={<Link className="h-4 w-4" />}
            trend={{
              value: metrics.userActivity.smartLinksCreatedThisWeek,
              label: "this week"
            }}
          />
          <MetricCard
            title="Total Views"
            value={metrics.smartLinks.totalViews}
            description="All-time playlist sharing link views"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <MetricCard
            title="Avg Views/Link"
            value={metrics.smartLinks.avgViewsPerLink}
            description="Average performance"
            icon={<BarChart3 className="h-4 w-4" />}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Your Statistics Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Music Collection</CardTitle>
              <CardDescription>Overview of your playlists and engagement</CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="#06b6d4"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Performing Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Performing Playlist Sharing Links</CardTitle>
              <CardDescription>Most viewed shared playlists</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics.smartLinks.topPerformingLinks.length > 0 ? (
                  metrics.smartLinks.topPerformingLinks.slice(0, 5).map((link, index) => (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <a 
                          href={`/share/${link.playlistId}/${link.playlistTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors cursor-pointer block"
                        >
                          {link.title}
                        </a>
                        <p className="text-xs text-muted-foreground truncate">
                          {link.playlistTitle}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          {link.views} views
                        </Badge>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No playlist sharing links created yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}