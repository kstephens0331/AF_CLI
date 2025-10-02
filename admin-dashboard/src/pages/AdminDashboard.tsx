import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardContent } from '@mui/material';
import {
  People as UsersIcon,
  AttachMoney as PaymentsIcon,
  Equalizer as AnalyticsIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import UserManagement from '../components/UserManagement';
import PaymentManagement from '../components/PaymentManagement';
import SystemAnalytics from '../components/SystemAnalytics';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [tabValue, setTabValue] = useState(0);

  const handleChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h4" gutterBottom>
            Admin Dashboard
          </Typography>
          <Typography variant="body1">
            Manage your Autopilot CLI platform
          </Typography>
        </CardContent>
      </Card>

      <Tabs 
        value={tabValue} 
        onChange={handleChange}
        variant="fullWidth"
        sx={{ mb: 3 }}
      >
        <Tab label="Users" icon={<UsersIcon />} />
        <Tab label="Payments" icon={<PaymentsIcon />} />
        <Tab label="Analytics" icon={<AnalyticsIcon />} />
        <Tab label="Settings" icon={<SettingsIcon />} />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <UserManagement />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <PaymentManagement />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <SystemAnalytics />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <Typography>System Settings</Typography>
      </TabPanel>
    </Box>
  );
}