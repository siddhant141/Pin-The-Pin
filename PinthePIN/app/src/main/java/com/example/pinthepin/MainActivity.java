package com.example.pinthepin;

import androidx.appcompat.app.AppCompatActivity;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;


public class MainActivity extends AppCompatActivity {

	Intent mServiceIntent;
	private PinService mYourService;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);

		mYourService = new PinService();
		mServiceIntent = new Intent(this, mYourService.getClass());
		if (!isMyServiceRunning(mYourService.getClass())) {
			Log.d("Pinthepin","starting");
			startService(mServiceIntent);
		}
	}

	private boolean isMyServiceRunning(Class<?> serviceClass) {
		ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
		for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
			if (serviceClass.getName().equals(service.service.getClassName())) {
				Log.d ("Pinthepin", "Running");
				return true;
			}
		}
		Log.d ("Pinthepin", "Not running");
		return false;
	}
}
