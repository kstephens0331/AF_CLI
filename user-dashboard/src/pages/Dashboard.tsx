import React from 'react';
import { Box, Typography, Card, CardContent, Grid, LinearProgress } from '@mui/material';
import { Terminal, Code, Settings, AccountCircle } from '@mui/icons-material';

export default function Dashboard() {
  const usage = 65; // Example usage percentage
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Welcome Back
      </Typography>
      
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Terminal color="primary" sx={{ fontSize: 40, mr: 2 }} />
                <div>
                  <Typography variant="h6">Commands Used</Typography>
                  <Typography variant="h4">1,248</Typography>
                </div>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Code color="secondary" sx={{ fontSize: 40, mr: 2 }} />
                <div>
                  <Typography variant="h6">Projects</Typography>
                  <Typography variant="h4">8</Typography>
                </div>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Settings color="success" sx={{ fontSize: 40, mr: 2 }} />
                <div>
                  <Typography variant="h6">Plugins</Typography>
                  <Typography variant="h4">3</Typography>
                </div>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <AccountCircle color="info" sx={{ fontSize: 40, mr: 2 }} />
                <div>
                  <Typography variant="h6">Plan</Typography>
                  <Typography variant="h4">Pro</Typography>
                </div>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Monthly Usage
          </Typography>
          <Box display="flex" alignItems="center">
            <Box width="100%" mr={1}>
              <LinearProgress variant="determinate" value={usage} />
            </Box>
            <Box minWidth={35}>
              <Typography variant="body2" color="text.secondary">{`${usage}%`}</Typography>
            </Box>
          </Box>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            1,248 of 2,000 commands used this month
          </Typography>
        </CardContent>
      </Card>
      
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Activity
          </Typography>
          {/* Activity timeline component would go here */}
        </CardContent>
      </Card>
    </Box>
  );
}