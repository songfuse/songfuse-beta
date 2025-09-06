import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreditTransaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  createdAt: string;
}

interface CreditDisplayProps {
  userId: number;
  showDetails?: boolean;
  className?: string;
}

export function CreditDisplay({ userId, showDetails = true, className = "" }: CreditDisplayProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Fetch user credits
  const { data: creditsData, isLoading: creditsLoading, refetch: refetchCredits } = useQuery({
    queryKey: [`/api/users/${userId}/credits`],
    enabled: !!userId,
  });

  // Fetch credit transactions for history
  const { data: transactions, isLoading: transactionsLoading } = useQuery<CreditTransaction[]>({
    queryKey: [`/api/users/${userId}/credit-transactions`],
    enabled: !!userId && isHistoryOpen,
  });

  const credits = creditsData?.credits ?? 0;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionColor = (amount: number) => {
    return amount > 0 ? "text-green-600" : "text-red-600";
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return <Plus className="h-3 w-3 text-green-600" />;
      case 'usage':
        return <Coins className="h-3 w-3 text-red-600" />;
      default:
        return <Coins className="h-3 w-3 text-gray-600" />;
    }
  };

  if (creditsLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-pulse bg-gray-200 rounded-full h-6 w-16"></div>
      </div>
    );
  }

  const CreditBadge = () => (
    <Badge 
      variant={credits > 0 ? "default" : "destructive"} 
      className="flex items-center space-x-1 cursor-pointer ml-[10px] mr-[10px]"
    >
      <Coins className="h-3 w-3" />
      <span>{credits} credit{credits !== 1 ? 's' : ''}</span>
    </Badge>
  );

  if (!showDetails) {
    return (
      <div className={className}>
        <CreditBadge />
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <CreditBadge />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Credits</h4>
            </div>
            
            <div className="text-sm text-gray-600">
              <p>Credits are used for:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Creating AI playlists (1 credit)</li>
                <li>Generating playlist sharing links (1 credit)</li>
                <li>Custom cover images (1 credit)</li>
              </ul>
            </div>

            <div className="flex space-x-2">
              <Button size="sm" variant="outline" className="flex-1">
                <Plus className="h-3 w-3 mr-1" />
                Buy Credits
              </Button>
              
              <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <History className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Credit History</DialogTitle>
                    <DialogDescription>
                      Your recent credit transactions
                    </DialogDescription>
                  </DialogHeader>
                  
                  <ScrollArea className="max-h-96">
                    {transactionsLoading ? (
                      <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="animate-pulse bg-gray-100 rounded h-12 w-full" />
                        ))}
                      </div>
                    ) : transactions && transactions.length > 0 ? (
                      <div className="space-y-2">
                        {transactions.map((transaction) => (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between p-2 rounded-lg border"
                          >
                            <div className="flex items-center space-x-2">
                              {getTransactionIcon(transaction.type)}
                              <div>
                                <p className="text-sm font-medium">
                                  {transaction.description}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(transaction.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className={`text-sm font-medium ${getTransactionColor(transaction.amount)}`}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No transactions yet
                      </p>
                    )}
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}