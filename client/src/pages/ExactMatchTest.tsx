import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

/**
 * Test page for the exact title matching algorithm
 */
const ExactMatchTest: React.FC = () => {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert input to an array of titles
  const getTitles = () => {
    return input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  };

  // Test the exact title matching endpoint
  const testExactMatching = async () => {
    const titles = getTitles();
    
    if (titles.length === 0) {
      setError("Please enter at least one track title");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/v2/exact-title-matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ titles }),
      });
      
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Exact Title Matching Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Input Titles</CardTitle>
            <CardDescription>
              Enter track titles to search for (one per line)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="titles">Track Titles</Label>
            <Textarea
              id="titles"
              className="h-60 mb-4"
              placeholder="Enter track titles, one per line"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            
            <div className="flex justify-between items-center">
              <div>
                {getTitles().length} title(s) entered
              </div>
              <Button onClick={testExactMatching} disabled={isLoading}>
                {isLoading ? 'Searching...' : 'Search Database'}
              </Button>
            </div>
            
            {error && (
              <div className="text-red-500 mt-4">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Exact title matches from database
            </CardDescription>
          </CardHeader>
          <CardContent>
            {results ? (
              <div>
                <div className="mb-4">
                  <strong>Found:</strong> {results.count} tracks
                  <br />
                  <strong>Requested:</strong> {results.requested} titles
                </div>
                
                {results.tracks && results.tracks.length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Title</th>
                          <th className="p-2 text-left">Popularity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.tracks.map((track: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{i + 1}</td>
                            <td className="p-2">{track.title}</td>
                            <td className="p-2">{track.popularity || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-amber-600">
                    No matches found
                  </div>
                )}
                
                <div className="mt-4">
                  <details>
                    <summary className="cursor-pointer text-sm text-blue-600">
                      View Raw Response
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 rounded-md overflow-auto text-xs">
                      {JSON.stringify(results, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 italic">
                Results will appear here after search
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ExactMatchTest;