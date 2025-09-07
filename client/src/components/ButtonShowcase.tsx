import React from 'react';
import { Button } from '@/components/ui/button';

const ButtonShowcase: React.FC = () => {
  return (
    <div className="p-8 space-y-6">
      <h2 className="text-2xl font-bold mb-6">Button Style Showcase</h2>
      
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Primary Buttons</h3>
          <div className="flex gap-4 flex-wrap">
            <Button>Join now</Button>
            <Button size="sm">Small Primary</Button>
            <Button size="lg">Large Primary</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2">Secondary Buttons</h3>
          <div className="flex gap-4 flex-wrap">
            <Button variant="outline">Look around a bit</Button>
            <Button variant="outline" size="sm">Small Secondary</Button>
            <Button variant="outline" size="lg">Large Secondary</Button>
            <Button variant="outline" disabled>Disabled</Button>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2">Other Variants</h3>
          <div className="flex gap-4 flex-wrap">
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ButtonShowcase;
