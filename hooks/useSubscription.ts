import { useState } from 'react';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  interval: 'month' | 'year';
  features: string[];
  isPopular?: boolean;
}

export const useSubscription = () => {
  const [loading, setLoading] = useState(false);
  const [plans] = useState<SubscriptionPlan[]>([
    {
      id: 'free',
      name: 'Basic',
      price: '$0',
      interval: 'month',
      features: ['5 uploads per month', 'Standard AI tagging', 'Public closet access'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$9.99',
      interval: 'month',
      features: ['Unlimited uploads', 'Advanced AI recommendations', 'Private closet', 'Priority support'],
      isPopular: true,
    },
    {
      id: 'premium',
      name: 'Premium',
      price: '$99.99',
      interval: 'year',
      features: ['Everything in Pro', 'Exclusive style drops', 'Personal stylist chat', 'Ad-free experience'],
    },
  ]);

  const subscribe = async (planId: string) => {
    setLoading(true);
    try {
      // Logic for subscription would go here
      console.log(`Subscribing to ${planId}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
      setLoading(false);
    }
  };

  return { plans, loading, subscribe };
};
