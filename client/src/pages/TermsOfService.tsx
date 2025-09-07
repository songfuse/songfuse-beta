import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

export default function TermsOfService() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  // If user is logged in, redirect to home page
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto max-w-4xl p-4 sm:p-6 pb-24 lg:pb-6 h-full">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="text-4xl font-bold mb-2 text-center bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">
            Songfuse Terms of Service
          </h1>
          <p className="text-gray-400 text-center">Last Updated: April 21, 2025</p>
        </div>

        <div className="bg-gray-800/40 rounded-lg p-6 mb-8 shadow-lg border border-gray-700">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">1. Acceptance of Terms</h2>
            <p className="mb-4">
              By accessing or using the Songfuse application ("Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you disagree with any part of the terms, you may not access the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">2. Description of Service</h2>
            <p className="mb-4">
              Songfuse is an AI-powered music playlist generation service that creates personalized playlists based on user prompts. 
              The Service integrates with third-party streaming platforms but does not host or distribute music content directly.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">3. Intellectual Property Rights</h2>
            <p className="mb-4">
              All content generated through the Songfuse application, including but not limited to playlist titles, descriptions, 
              cover images, and AI-generated recommendations, are the exclusive property of Songfuse and are protected by copyright, 
              trademark, and other intellectual property laws.
            </p>
            <p className="mb-4">
              Users are granted a limited, non-exclusive, non-transferable license to use the generated content for personal, 
              non-commercial purposes within the Service. The redistribution, reproduction, modification, publication, or creation 
              of derivative works from any Songfuse-generated content outside the Service without explicit written permission is 
              strictly prohibited.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">4. User Accounts</h2>
            <p className="mb-4">
              To use certain features of the Service, you may be required to register for an account. You are responsible for 
              maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">5. Third-Party Services</h2>
            <p className="mb-4">
              The Service integrates with third-party music streaming platforms. By using these integrations, you agree to comply 
              with the respective terms of service of those platforms. Songfuse is not responsible for the content, privacy policies, 
              or practices of any third-party services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">6. Prohibited Uses</h2>
            <p className="mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Generate or distribute content that is illegal, harmful, threatening, abusive, or otherwise objectionable</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Impersonate any person or entity or falsely state or misrepresent your affiliation with a person or entity</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Harvest or collect user information without their consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">7. Disclaimer of Warranties</h2>
            <p className="mb-4">
              The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. 
              Songfuse does not warrant that the Service will be uninterrupted or error-free, or that defects will be corrected.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">8. Limitation of Liability</h2>
            <p className="mb-4">
              In no event shall Songfuse be liable for any indirect, incidental, special, consequential, or punitive damages, 
              including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from 
              your access to or use of or inability to access or use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">9. Changes to Terms</h2>
            <p className="mb-4">
              Songfuse reserves the right, at our sole discretion, to modify or replace these Terms at any time. If a revision 
              is material, we will provide at least 30 days' notice prior to any new terms taking effect.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">10. Contact Us</h2>
            <p className="mb-4">
              If you have any questions about these Terms, please contact us at: legal@songfuse.app
            </p>
          </section>
        </div>

        <div className="flex justify-center mt-8">
          <Link href="/">
            <Button>
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}