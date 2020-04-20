package com.example.pinthepin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

public class ServiceRestart extends BroadcastReceiver {

	@Override
	public void onReceive(Context context, Intent intent) {
		Log.d("Pinthepin", "Broadcast received");
//		Toast.makeText(context, "Service restarted", Toast.LENGTH_SHORT).show();
		context.stopService(intent);
		Log.d("Pinthepin","Service stopped");
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
			context.startForegroundService(new Intent(context, PinService.class));
		} else {
			context.startService(new Intent(context, PinService.class));
		}
	}
}
