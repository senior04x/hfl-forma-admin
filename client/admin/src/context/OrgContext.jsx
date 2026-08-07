import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const OrgContext = createContext(null);

export const OrgProvider = ({ children }) => {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch active or default organization
    const fetchOrg = async () => {
      try {
        const { data } = await supabase.from('organizations').select('*').limit(1).single();
        if (data) {
          setOrganization(data);
        }
      } catch (err) {
        console.warn('Organization fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrg();
  }, []);

  return (
    <OrgContext.Provider value={{ organization, setOrganization, loading }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const context = useContext(OrgContext);
  if (!context) {
    return { organization: null, setOrganization: () => {}, loading: false };
  }
  return context;
};

export default OrgContext;
